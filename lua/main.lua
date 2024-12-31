local server = require "resty.websocket.server"
local cjson = require "cjson"
local MAX_CONCURRENT_COMPILES = 8

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

local whoami = ngx.location.capture("/users/me")
if whoami.status == 401 then
  ngx.log(ngx.ERR, "Rejecting unauthenticated websocket")
  return ngx.exit(444)
end

local function runprogram(json)
  local newval, err = state:incr("compiling", 1)
  ngx.req.read_body()
  if err then
    ngx.log(ngx.ERR, "failed incr compiling", err)
    return ngx.exit(444)
  end
  if newval > MAX_CONCURRENT_COMPILES then
    local bytes, err = wb:send_text(cjson.encode({op = json.op, result = "concurrency exceeded: " .. tostring(newval)}))
  end
  local args = {}
  if json.test then
    args.test = 1
  end
  local compile = ngx.location.capture("/projects/" .. tostring(json.pid) .. "/compile", {
    args=args,
    body=cjson.encode(json.files),
    method=ngx.HTTP_POST,
    headers={["content-type"]="application/json"}
  })
  newval, err = state:incr("compiling", -1)
  compile_result = cjson.decode(compile.body)
  if compile_result.error then
    local bytes, err = wb:send_text(cjson.encode({op = json.op, output = compile_result.error, complete = true}))
    if not bytes then
      ngx.log(ngx.ERR, "failed to send text: ", err)
      newval, err = state:incr("compiling", -1)
      return ngx.exit(444)
    end
  end
  local bytes, err = wb:send_text(cjson.encode({output="compiled\n"}))
  local execute = ngx.location.capture("/projects/" .. tostring(json.pid) .. "/execute/" .. compile_result.container, {
    args=args,
    body = cjson.encode({tests = compile_result.tests}),
    method=ngx.HTTP_POST,
    headers={["content-type"]="application/json"}
  })
  wb:send_text(cjson.encode({output = execute.body, complete = true}))
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
