local server = require "resty.websocket.server"
local ngx_pipe = require "ngx.pipe"
local cjson = require "cjson"
local MAX_CONCURRENT_COMPILES = 2
local resty_lock = require "resty.lock"

local state = ngx.shared.state
-- Uses nowcompiling:i, compilequeue as list keys
-- nextid for next id, temporarily(?)
-- nextcompile for the next job to compile
if false then
  state:delete("nextcompile")
  for i=1, MAX_CONCURRENT_COMPILES do
    state:delete("nowcompiling:" .. tostring(i))
  end
  state:delete("compilequeue")
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
        local input = ngx.location.capture("/containers/" .. tostring(tmpname) .. "/stdin", {
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
  local lock, err = resty_lock:new("state", {exptime = 10, timeout = 5})
  if not lock then
    ngx.log(ngx.ERR, "failed to create lock: ", err)
    return ngx.exit(444)
  end
  local compileid = state:incr("nextid", 1, 0)
  ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] initializing")
  local elapsed, err = lock:lock("compile")
  if not elapsed then
    ngx.log(ngx.ERR, "failed to lock lock: ", err)
    return ngx.exit(444)
  end
  local ready = false
  -- if there's a nextcompile, we know there's a queue.
  if not state:get("nextcompile") then
      ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] checking for a slot")
    -- if there's no nextcompile, try to grab a slot.
    for i=1, MAX_CONCURRENT_COMPILES do
      local success, err = state:add("nowcompiling:" .. tostring(i), compileid)
      if success then
        ready = i
        ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] taking slot " .. tostring(ready))
        break
      end
    end
  end
  local ok, err = lock:unlock("compile")
  if not ok then
    ngx.log(ngx.ERR, "failed to unlock lock: ", err)
    return ngx.exit(444)
  end

  if not ready then
    local isnext, err = state:add("nextcompile", compileid)
    ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] checking for nextcompile")
    local position, err
    if not isnext then
      position, err = state:rpush("compilequeue", compileid)
      ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] is going into the queue in position " .. tostring(position + 1))
      position = position + 1
      local bytes, err = wb:send_text(cjson.encode({op = json.op, status = "#" .. tostring(position) .. " in queue..."}))
    end
    local retries = 0
    local lastnext = -1
    while not isnext do
      ngx.sleep(1)
      local nextcompile = state:get("nextcompile")
      if nextcompile  == compileid then
        isnext = true
        ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] is finally next")
      end
      -- After 35 seconds, with no nextcompile update, update it
      retries = retries + 1
      if nextcompile ~= lastnext then
        lastnext = nextcompile
        retries = 0
        position = position - 1
        local bytes, err = wb:send_text(cjson.encode({op = json.op, status = "#" .. tostring(position) .. " in queue..."}))
      end
      if retries > 35 then
        lock:lock("compile")
        -- Make sure no one else updated it already
        local updatednextcompile = state:get("nextcompile")
        if updatednextcompile == lastnext then
          local nextinqueue, err = state:lpop("compilequeue")
          ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] timeout overriding nextcompile from " .. tostring(lastnext) .. " to " .. tostring(nextinqueue))
          state:set("nextcompile", nextinqueue)
        end
        lock:unlock("compile")
      end
    end
    retries = 0
    local bytes, err = wb:send_text(cjson.encode({op = json.op, status = "#1 in queue..."}))
    while not ready do
      ngx.sleep(0.5)
      for i=1, MAX_CONCURRENT_COMPILES do
        local success, err = state:add("nowcompiling:" .. tostring(i), compileid)
        if success then
          ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] is finally ready")
          ready = i
          break
        end
      end
      -- After 30 seconds, nuke the queue and try again
      retries = retries + 1
      if retries > 60 then
        ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] timeout; nuking nowcompiling")
        for i=1, MAX_CONCURRENT_COMPILES do
          local stale = state:get("nowcompiling:" .. tostring(i))
          ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] removing " .. tostring(stale) .. " from slot " .. tostring(i))
          state:delete("nowcompiling:" .. tostring(i))
        end
        retries = 0
      end
    end
    lock:lock("compile")
    local nextinqueue, err = state:lpop("compilequeue")
    state:set("nextcompile", nextinqueue)
    ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] setting " .. tostring(nextinqueue) .. " as nextcompile")
    lock:unlock("compile")
  end

  local args = {}
  if json.test then
    args.test = 1
  end
  ngx.req.set_header("Content-Type", "application/json")
  local bytes, err = wb:send_text(cjson.encode({op = json.op, status = "compiling..."}))
  local compile = ngx.location.capture("/projects/" .. tostring(json.pid) .. "/compile", {
    args=args,
    body=cjson.encode(json.files),
    method=ngx.HTTP_POST,
    headers={["Content-Type"]="application/json"}
  })

  lock:lock("compile")
  local curinslot = state:get("nowcompiling:" .. tostring(ready))
  if curinslot == compileid then
    ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] releasing slot " .. tostring(ready))
    state:delete("nowcompiling:" .. tostring(ready))
  else
    ngx.log(ngx.ERR, "compile [" .. tostring(compileid) .. "] FAILED releasing slot " .. tostring(ready) .. " taken by " .. tostring(curinslot))
  end
  lock:unlock("compile")


  local compile_result = cjson.decode(compile.body)
  if compile_result.error then
    local bytes, err = wb:send_text(cjson.encode({op = json.op, output = compile_result.error, complete = true, status="error compiling"}))
    if not bytes then
      ngx.log(ngx.ERR, "failed to send text: ", err)
      return ngx.exit(444)
    end
    return ngx.exit(444)
  end
  local bytes, err = wb:send_text(cjson.encode({status="running"}))
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

  local finalline = ""
  while true do
    local output, err = running:stdout_read_any(4096)
    if output then
      wb:send_text(cjson.encode({output = output}))
      if json.test then
        finalline = string.gsub(finalline .. output, "^.*\n([^\n][^\n]*\n*)$", "%1")
      end
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
  if json.test then
    ngx.location.capture("/projects/" .. tostring(json.pid) .. "/tests/save", {
      body = cjson.encode({finalline = finalline}),
      method = ngx.HTTP_POST,
      headers = {["content-type"]="application/json"}
    })
  end
  wb:send_text(cjson.encode({output = output, complete = true, status="complete"}))
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
