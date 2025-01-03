{
  idecl-poc = { modulesPath, lib, name, pkgs, ... }: let 
    idecl-port = 9453;
    common = import ../common.nix { inherit pkgs idecl-port idecl-src; hostname = "idecl.edanaher.net"; };
    terraform-state = builtins.fromJSON (builtins.readFile ../terraform/terraform-out.json);
    resources = terraform-state.values.root_module.resources;
    host = builtins.elemAt resources 0;
    ip = host.values.ipv4_address;
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
        ];
    };
    idecl-java-runner = common.idecl-java-runner;
    python-with-packages = common.python-with-packages;
    init-script = pkgs.writeShellScript "init-idecl" ''
      export HOME=/app
      mkdir -p /app
      mkdir -p /var/run/idecl
      cd ${idecl-src}/executors/simplejava
      source /app/secrets.sh
      ${pkgs.python3Packages.alembic}/bin/alembic upgrade head
      for u in ''${USERS//,/ }; do
        ${pkgs.sqlite}/bin/sqlite3 ~/idecl.db "INSERT INTO users (email) VALUES ('$u') ON CONFLICT DO NOTHING"
      done
      docker images -q idecl-java-runner:latest | grep . || docker load < ${idecl-java-runner} | ${pkgs.gawk}/bin/awk '{print $3}' | xargs -I {} docker tag {} idecl-java-runner
      '';
    litestream-config = pkgs.writeText "litestream-config" ''
      dbs:
        - path: /app/idecl.db
          replicas:
            - url: s3://edanaher-idecl/litestream-prod-bak
              retention: 168h
              sync-interval: 60s
      '';
  in {
    imports = lib.optional (builtins.pathExists ./do-userdata.nix) ./do-userdata.nix ++ [
      (modulesPath + "/virtualisation/digital-ocean-config.nix")
    ];

    deployment.targetHost = ip;
    deployment.targetUser = "root";

    networking.hostName = name;
    system.stateVersion = "24.11";

    environment.systemPackages = with pkgs; [ screen sqlite-interactive ];


    deployment.healthChecks = {
      http = [ {
        scheme = "https";
        host = "idecl.edanaher.net";
        port = 443;
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

    networking.firewall.allowedTCPPorts = [ 80 443 ];
    security.acme.acceptTerms = true;
    security.acme.defaults.email = "ssl@edanaher.net";
    services.nginx = common.nginx-config;
    users.users.nginx.extraGroups = [ "docker" ];

    virtualisation.docker.enable = true;

    # I accept that there may be an ssh MITM.
    nixpkgs.config.permittedInsecurePackages = [ "litestream-0.3.13" ];
    systemd.services.idecl-backup =  {
      description = "backup service for idecl";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        WorkingDirectory = "/app";
        ExecStart = "/bin/sh -c 'source /app/secrets.sh && ${pkgs.litestream}/bin/litestream replicate -config ${litestream-config}'";
      };
    };

    systemd.services.idecl =  {
      description = "daemon for idecl";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      path = with pkgs; [ docker gnutar outils coreutils zstd ];
      environment = {
        PYTHONPATH="${python-with-packages}/${python-with-packages.sitePackages}";
        HOME="/app";
        USERS="edanaher@gmail.com";
      };
      serviceConfig = {
        WorkingDirectory = "${idecl-src}/executors/simplejava";
        ExecStartPre = "${init-script}";
        ExecStart = "/bin/sh -c 'source /app/secrets.sh && ${pkgs.python3Packages.gunicorn}/bin/gunicorn app:app --threads 4 --workers 2 --bind 0.0.0.0:${builtins.toString idecl-port}'";
      };
    };
  };

}
