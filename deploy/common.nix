{pkgs, hostname, idecl-port, idecl-src, dev ? false}:
let usessl = ! dev;
in
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
  junit = pkgs.stdenv.mkDerivation rec {
    version = "4.13.2";
    name = "junit-${version}";

    src = pkgs.fetchurl {
      url = "https://repo1.maven.org/maven2/junit/junit/${version}/junit-${version}.jar";
      hash = "sha256-jklbY0Rp1k+4rPo0laBly6zIoP/1XOHjEAe+TBbcV9M=";
    };

    unpackPhase = "true";
    buildPhase = "true";

    installPhase = ''
      mkdir -p $out
      cp $src $out/junit-${version}.jar
    '';
  };
  hamcrest = pkgs.stdenv.mkDerivation rec {
    version = "1.3";
    name = "junit-${version}";

    src = pkgs.fetchurl {
      url = "https://repo1.maven.org/maven2/org/hamcrest/hamcrest-core/${version}/hamcrest-core-${version}.jar";
      hash = "sha256-Zv3vkelzk0jfeglqo4SlaF9Oh1WEzOiThqekclHE2Ok=";
    };

    unpackPhase = "true";
    buildPhase = "true";

    installPhase = ''
      mkdir -p $out
      cp $src $out/hamcrest-core-${version}.jar
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
        proxyPass = "http://127.0.0.1:${builtins.toString idecl-port}";
        extraConfig = ''
          proxy_set_header Host $host${if dev then ":5000" else ""};
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
          set $docker_bin "${pkgs.docker}/bin/docker";
          set $junit_path "${junit}";
          set $hamcrest_path "${hamcrest}";
          content_by_lua_file ${idecl-src}/lua/main.lua;
        '';
      };
    };
  };
}
