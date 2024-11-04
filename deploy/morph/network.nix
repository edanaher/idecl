{
  idecl-poc = { modulesPath, lib, name, pkgs, ... }: let 
    terraform-state = builtins.fromJSON (builtins.readFile ../terraform/terraform-out.json);
    resources = terraform-state.values.root_module.resources;
    host = builtins.elemAt resources 0;
    ip = host.values.ipv4_address;
    idecl-port = 9453;
    idecl-src = pkgs.stdenv.mkDerivation {
      name = "idecl-src";

      src = ../..;

      installPhase = ''
        mkdir -p $out
        cp -a * $out
        '';

      buildInputs = [ pkgs.makeWrapper ];

      propagatedBuildInputs = with pkgs; [
          python3 python3Packages.flask python3Packages.flask-login python3Packages.requests
          python3Packages.gunicorn python3Packages.sqlalchemy python3Packages.alembic
          jdk
        ];
    };
    python-with-packages = pkgs.python3.withPackages (pp: with pp; [
      pp.flask pp.flask-login pp.requests
      pp.gunicorn pp.sqlalchemy pp.alembic
    ]);
    init-script = pkgs.writeShellScript "init-idecl" ''
      export HOME=/app
      mkdir -p /app
      cd ${idecl-src}/executors/simplejava
      source /app/secrets.sh
      ${pkgs.python3Packages.alembic}/bin/alembic upgrade head
      for u in ''${USERS//,/ }; do
        echo "Adding user $u"
        ${pkgs.sqlite}/bin/sqlite3 ~/idecl.db "INSERT INTO users (email) VALUES ('$u') ON CONFLICT DO NOTHING"
      done
      '';
  in {
    imports = lib.optional (builtins.pathExists ./do-userdata.nix) ./do-userdata.nix ++ [
      (modulesPath + "/virtualisation/digital-ocean-config.nix")
    ];

    deployment.targetHost = ip;
    deployment.targetUser = "root";

    networking.hostName = name;
    system.stateVersion = "24.11";

    deployment.healthChecks = {
      http = [ {
        scheme = "http";
        port = 80;
        path = "/";
        description = "check that nginx is running";
      } ];
    };

    deployment.secrets.env-file = {
      source = "./secrets.sh";
      destination = "/app/secrets.sh";
      owner.user = "root";
      owner.group = "root";
#action = [ "systemctl" "restart" "idecl" ];
    };

    networking.firewall.allowedTCPPorts = [ 80 ];
    services.nginx = {
      enable = true;
      virtualHosts.default = {
        default = true;
        locations."/" = {
          proxyPass = "http://localhost:${builtins.toString idecl-port}";
          extraConfig = ''
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $remote_addr;
          '';
        };
#enableACME = true;
      };
    };

    systemd.services.idecl =  {
      description = "daemon for idecl";
      after = [ "network.target" ];
      wantedBy = [ "multiuser.target" ];
      environment = {
        PYTHONPATH="${python-with-packages}/${python-with-packages.sitePackages}";
        HOME="/app";
        USERS="edanaher@gmail.com";
      };
      serviceConfig = {
        WorkingDirectory = "${idecl-src}/executors/simplejava";
        ExecStartPre = "${init-script}";
        ExecStart = "/bin/sh -c 'source /app/secrets.sh && ${pkgs.python3Packages.gunicorn}/bin/gunicorn app:app --bind 0.0.0.0:${builtins.toString idecl-port}'";
      };
    };
  };

}
