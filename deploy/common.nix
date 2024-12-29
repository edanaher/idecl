{pkgs, hostname, usessl, idecl-port, idecl-src}: 
rec {
  idecl-port = 9453;
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
  ace = pkgs.stdenv.mkDerivation rec {
    version = "v1.37.1";
    name = "ace-web-editor-${version}";

    buildDependencies = [ pkgs.git ]; # Shouldn't fetchFromGithub handle this?

    src = pkgs.fetchFromGitHub {
      owner = "ajaxorg";
      repo = "ace-builds";
      rev = version;
      hash = "sha256-o0E67W97e51IwCa7ur/GBU5/q9b1U2AF45HejNf5bt0=";
    };

    buildPhase = "true";

    installPhase = ''
      mkdir -p $out
      cp src-min/ace.js $out/
    '';
  };
  nginx-config = {
    enable = true;
    package = pkgs.openresty;
    appendHttpConfig = ''
        lua_shared_dict state 20k;
    '';
    virtualHosts."${hostname}" = {
      default = true;
      locations."/static/ace/" = {
        alias = "${ace}/";
      };
      locations."/static/" = {
        alias = "${idecl-src}/client/";
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
      locations."/websocket" = {
        extraConfig = ''
          lua_code_cache off;
          lua_socket_log_errors off;
          lua_check_client_abort on;
          content_by_lua_file ${idecl-src}/lua/main.lua;
        '';
      };
    };
  };
}
