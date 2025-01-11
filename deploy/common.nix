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
  xtermjs = pkgs.stdenv.mkDerivation rec {
    version = "3.2.3";
    name = "xterm-${version}";

    src = pkgs.fetchzip {
      url = "https://registry.npmjs.org/@xterm/xterm/-/xterm-5.5.0.tgz";
      hash = "sha256-mz+qSQCSLryOmuBvuH99yZiqoT8dTZINc9qSkIhRdLc=";
    };

    fit-src = pkgs.fetchzip {
      url = "https://registry.npmjs.org/@xterm/addon-fit/-/addon-fit-0.10.0.tgz";
      hash = "sha256-w/yw7E9bGeivI10vnE2auwGNIhBnHx22HnUooHRH9Ng=";
    };

    buildPhase = "true";
    installPhase = ''
      mkdir -p $out
      cp $src/lib/xterm.js $out
      cp $src/css/xterm.css $out
      cp ${fit-src}/lib/addon-fit.js $out
    '';
  };
  dompurify = pkgs.stdenv.mkDerivation rec {
    version = "3.2.3";
    name = "dompurify-${version}";

    src = pkgs.fetchzip {
      url = "https://registry.npmjs.org/dompurify/-/dompurify-${version}.tgz";
      hash = "sha256-4D2+gSIRYE4KxLCk26DQYN2mCBG/K5ekirjY4IyIJ28=";
    };

    buildPhase = "true";
    installPhase = ''
      mkdir -p $out
      cp $src/dist/purify.min.js $out
    '';
  };
  marked = pkgs.stdenv.mkDerivation rec {
    version = "15.0.5";
    name = "marked-${version}";

    src = pkgs.fetchzip {
      url = "https://registry.npmjs.org/marked/-/marked-${version}.tgz";
      hash = "sha256-gjYSI2yr+KGQgEBy8mfDBi2vRp8CDqyGvVa/0QNVWMw=";
    };

    buildPhase = "true";
    installPhase = ''
      mkdir -p $out
      cp $src/marked.min.js $out
    '';
  };
  lib50 = pkgs.python3Packages.buildPythonApplication rec {
    pname = "lib50";
    version = "3.0.12";

    src = pkgs.fetchPypi {
      inherit pname version;
      hash ="sha256-Fc4Hb1AbSeetK3gH1/dRCUfHGDlMzfzgF1cnK3Se01U=";
    };

    doCheck = false;
  };
  compare50 = pkgs.python3Packages.buildPythonApplication rec {
    pname = "compare50";
    version = "1.2.6";

    src = pkgs.fetchPypi {
      inherit pname version;
      hash ="sha256-0v1DOwmw8GvsVgms/9J05zHws1qW9K0lUEKmBafkFAQ=";
    };

    # TODO: Do this properly.  But it works for now
    dependencies = with pkgs.python3Packages; [
      attrs
      intervaltree
      jinja2
      numpy
      pygments
      setuptools
      sortedcontainers
      termcolor
      tqdm
      lib50
      certifi
      cffi
      cryptography
      idna
      jellyfish
      markupsafe
      pexpect
      ptyprocess
      pyyaml
      requests
      urllib3
      chardet
    ];

    pythonpath = builtins.foldl' (a: b: a + ":" + b) "$out/lib/python3.12/site-packages" (builtins.map (p: "${p}/lib/python3.12/site-packages") dependencies);

    postInstall = ''
      sed "s#python3#PYTHONPATH='${pythonpath}' ${pkgs.python3}/bin/python3#" $out/bin/compare50 -i
      sed "1s#/usr/bin/env sh#/bin/sh#" $out/bin/compare50 -i
    '';


    doCheck = false;
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
      locations."/static/dompurify/" = {
        alias = "${dompurify}/";
      };
      locations."/static/marked/" = {
        alias = "${marked}/";
      };
      locations."/static/xterm/" = {
        alias = "${xtermjs}/";
      };
      locations."/static/" = {
        alias = "${idecl-src}/client/";
      };
      locations."/favicon.ico" = {
        root = "${idecl-src}/client/";
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
          ${if dev then "lua_code_cache off;" else ""}
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
