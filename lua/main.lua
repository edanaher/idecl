local server = require "resty.websocket.server"
local ngx_pipe = require "ngx.pipe"
local cjson = require "cjson"
local MAX_CONCURRENT_COMPILES = 2

local state = ngx.shared.state
if state:get("compiling") == nil then
  state:set("compiling", 0)
end
if state:get("runqueue") == nil then
  state:set("runqueue", {})
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

local stillrunning = true;
local function handle_input(path, name)
  local tmpname = path:gsub(".*/", "")
  while stillrunning do
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
    elseif typ == "close" then return
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
      if json.input then
        -- TODO: do this in lua; maybe with https://github.com/tokers/lua-io-nginx-module
        local compile = ngx.location.capture("/containers/" .. tostring(tmpname) .. "/stdin", {
          body = cjson.encode({input = json.input}),
          method = ngx.HTTP_POST,
          headers = {["content-type"]="application/json"}
        })
      end
      if json.kill then
        ngx_pipe.spawn({ngx.var.docker_bin, "kill", name}, {merge_stderr = true})
      end
    end
    ngx.sleep(0.1)
  end
  ngx.log(ngx.ERR, "Ran input thread")
end

local function runprogram(json)
  ngx.req.read_body()
  local newval, err = state:incr("compiling", 1)
  if err then
    ngx.log(ngx.ERR, "failed incr compiling", err)
    return ngx.exit(444)
  end
  if newval > MAX_CONCURRENT_COMPILES then
    -- TODO: Actually queue.
    local bytes, err = wb:send_text(cjson.encode({op = json.op, output = "waiting in queue..."}))
    while newval > MAX_CONCURRENT_COMPILES do
      state:incr("compiling", -1)
      ngx.sleep(0.5 + math.random())
      newval = state:incr("compiling", 1)
    end
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
  local newval, err = state:incr("compiling", -1)


  local compile_result = cjson.decode(compile.body)
  if compile_result.error then
    local bytes, err = wb:send_text(cjson.encode({op = json.op, output = compile_result.error, complete = true}))
    if not bytes then
      ngx.log(ngx.ERR, "failed to send text: ", err)
      return ngx.exit(444)
    end
    return ngx.exit(444)
  end
  local bytes, err = wb:send_text(cjson.encode({output="compiled\n", result=compile_result}))
  local command = {ngx.var.docker_bin, "run", "--rm", "--name", compile_result.container, "-m128m", "--ulimit", "cpu=10", "-v", compile_result.path .. ":/app", "--net", "none", "--", "idecl-java-runner", "/bin/sh", "-c", "java -cp /app Main <> /app/stdin.fifo"}
  if json.test then
    command = {ngx.var.docker_bin, "run", "--rm", "--name", compile_result.container, "-m128m", "--ulimit", "cpu=10", "-v", compile_result.path .. ":/app", "-v", ngx.var.junit_path .. ":/junit", "-v", ngx.var.hamcrest_path .. ":/hamcrest","--net", "none", "idecl-java-runner", "java", "-cp", "/junit/junit-4.13.2.jar:/hamcrest/hamcrest-core-1.3.jar:/app:/junit", "org.junit.runner.JUnitCore"}
    for _, t in ipairs(compile_result.tests) do
      local classname = t:gsub("/", "."):gsub(".java$", "")
      table.insert(command, classname)
    end
  end
  local running = ngx_pipe.spawn(command, {merge_stderr = true})
  ngx.thread.spawn(handle_input, compile_result.path, compile_result.container)

  while true do
    local output, err = running:stdout_read_any(4096)
    if output then
      wb:send_text(cjson.encode({output = output}))
    end
    if err == "closed" then
      break
    end
    if err and err ~= "timeout" then
      wb:send_text(cjson.encode({output = "Idecl error: " .. err.. "\n"}))
    end
    -- In case of badness, don't spam the client too hard.
    ngx.sleep(0.1)
  end
  wb:send_text(cjson.encode({output = output, complete = true}))
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
abort(444)
