local server = require "resty.websocket.server"
local cjson = require "cjson"
local nats = require "resty.nats"

local project_id

local wb, err = server:new{
  timeout = 5000,
  max_payload_len = 5 * 1024 * 1024
}
if not wb then
  ngx.log(ngx.ERR, "failed to create new websocket: ", err)
  return ngx.exit(444)
end

local n, err = nats:new()
if not n then
  ngx.log(ngx.ERR, "failed to create new nats connection: ", err)
  return ngx.exit(444)
end

local ok, err = n:connect("127.0.0.1", 4222)
if not ok then
  ngx.log(ngx.ERR, "failed to connect to nats server: ", err)
  return ngx.exit(444)
end

-- TODO: Real permissions.  This should come for free with server-authoritative history.
local whoami = ngx.location.capture("/users/me")
if whoami.status == 401 then
  ngx.log(ngx.ERR, "Rejecting unauthenticated websocket")
  return ngx.exit(444)
end

function propagate_history(msg)
  local bytes, err = wb:send_text(msg.payload)
  ngx.log(ngx.ERR, "Sent message: ", msg.payload)
  if err then
    ngx.log(ngx.ERR, "Error propagating hitory: ", err)
  end
end

function pollnats()
  while true do
    n:wait(999999)
  end
end

while true do
  local data, typ, err = wb:recv_frame()
  if wb.fatal then
    ngx.log(ngx.ERR, "failed to receive frame: ", err)
    return ngx.exit(444)
  end
  if not data then
    local bytes, err = wb:send_ping()
    if not bytes then
      ngx.log(ngx.ERR, "failed to send ping: ", err)
      return ngx.exit(444)
    end
  elseif typ == "close" then break
  elseif typ == "ping" then
    local bytes, err = wb:send_pong()
    if not bytes then
      ngx.log(ngx.ERR, "failed to send pong: ", err)
      return ngx.exit(444)
    end
  elseif typ == "pong" then
    ngx.log(ngx.INFO, "client ponged")
  elseif typ == "text" then
    -- Chrome likes to chunk requests.  We just concat them.
    if err == "again" then
      local cdata, ctyp
      while err == "again" do
        cdata, ctyp, err = wb:recv_frame()
        data = data .. cdata
      end
    end
    local json = cjson.decode(data)
    if json.op == "connect" then
      project_id = json.project
      ngx.log(ngx.ERR, "Client connected on project ", project_id)
      local ok, err = n:subscribe("project." .. project_id, propagate_history)
      if not ok then
        ngx.log(ngx.ERR, "Error subscribing to project.", project_id, ": ", err)
      end
      ngx.thread.spawn(pollnats)
    elseif json.op == "updates" then
      ngx.log(ngx.ERR, "Client sent update ", json.rawupdates[1][1], " on ", json.project)

      local pythonbody = {
        project_id = json.project,
        client_id = json.client_id,
        updates = json.updates
      }
      local compile = ngx.location.capture("/projects/" .. tostring(json.project) .. "/history", {
        body=cjson.encode(pythonbody),
        method=ngx.HTTP_POST,
        headers={["Content-Type"]="application/json"}
      })

      n:publish("project." .. project_id, data)
    else
      ngx.log(ngx.ERR, "Unknown websocket op:", json.op)
      return ngx.exit(444)
    end
  end
end
wb:send_close()
abort(444)
