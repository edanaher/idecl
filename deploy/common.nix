{pkgs, hostname, usessl, idecl-port, idecl-src}: 
{
  idecl-port = 5000;
  python-with-packages = pkgs.python3.withPackages (pp: with pp; [
    pp.flask pp.flask-login pp.requests
    pp.gunicorn pp.sqlalchemy pp.alembic
  ]);
  idecl-java-runner = pkgs.dockerTools.buildImage {
    name = "idecl-java-runner";
    tag = "0.0.1";

    copyToRoot = pkgs.buildEnv {
      name = "image-root";
      paths = [ pkgs.jdk
        pkgs.busybox # For debugging
      ];
      pathsToLink = "/bin";
    };

    config = {
      Env = [ "PATH=/bin/" ];
      Cmd = [ "${pkgs.bash}/bin/bash" ]; # TODO: this is for testing and should be removed
    };

    created = "now";
  };
  nginx-config = {
    enable = true;
    package = pkgs.openresty;
    virtualHosts."${hostname}" = {
      default = true;
      locations."/static/" = {
        alias = "${idecl-src}/client/";
      };
      locations."/lua" = {
        extraConfig = ''
          default_type text/plain;

          content_by_lua_block {
            ngx.say("Hello from openresty")
          }
        '';
      };
      locations."/" = {
        proxyPass = "http://localhost:${builtins.toString idecl-port}";
        extraConfig = ''
          proxy_set_header Host $host;
          proxy_set_header X-Forwarded-For $remote_addr;
          proxy_buffering off;
        '';
      };
      enableACME = usessl;
      forceSSL = usessl;
      locations."/sockets/websocket" = {
        extraConfig = ''
          lua_socket_log_errors off;
          lua_check_client_abort on;
          content_by_lua '
            local server = require "resty.websocket.server"
            local wb, err = server:new{
              timeout = 5000,
              max_payload_len = 65535
            }
            if not wb then
              ngx.log(ngx.ERR, "failed to new websocket: ", err)
              return ngx.exit(444)
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
                local bytes, err = wb:send_text(data)
                if not bytes then
                  ngx.log(ngx.ERR, "failed to send text: ", err)
                  return ngx.exit(444)
                end
              end
            end
            wb:send_close()
        ';
        '';
      };
    };
  };
}
