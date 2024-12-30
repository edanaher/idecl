local server = require "resty.websocket.server"
local cjson = require "cjson"
local MAX_CONCURRENT_COMPILES = 2

local state = ngx.shared.state
if state:get("compiling") == nil then
  state:set("compiling", 0)
end
if state:get("runqueue") == nil then
  state:set("runcount", {})
end
local wb, err = server:new{
  timeout = 5000,
  max_payload_len = 65535
}
if not wb then
  ngx.log(ngx.ERR, "failed to new websocket: ", err)
  return ngx.exit(444)
end

function runprogram(json)
  newval, err = state:incr("compiling", 1)
  if err then
    ngx.log(ngx.ERR, "failed incr compiling", err)
    return ngx.exit(444)
  end
  if newval > MAX_CONCURRENT_COMPILES then
    local bytes, err = wb:send_text(cjson.encode({op = json.op, result = "concurrency exceeded: " .. tostring(newval)}))
    state:incr("compiling", -1)
    return
  end
  ngx.sleep(10)
  local bytes, err = wb:send_text(cjson.encode({op = json.op, result = "oh noes"}))
  if not bytes then
    ngx.log(ngx.ERR, "failed to send text: ", err)
    return ngx.exit(444)
  end
  newval, err = state:incr("compiling", -1)
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
    local json = cjson.decode(data)
    if json.op == "run" then
      runprogram(json)
      return ngx.exit(444)
    else
        ngx.log(ngx.ERR, "Unknown websocket op:", json.op)
        return ngx.exit(444)
    end
  end
end
wb:send_close()
