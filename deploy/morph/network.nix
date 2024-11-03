{
  idecl-poc = { modulesPath, lib, name, pkgs, ... }: let 
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
          jdk
        ];
    };
    python-with-packages = pkgs.python3.withPackages (pp: with pp; [
      pp.flask pp.flask-login pp.requests
      pp.gunicorn pp.sqlalchemy pp.alembic
    ]);

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

    networking.firewall.allowedTCPPorts = [ 80 ];
    services.nginx = {
      enable = true;
      virtualHosts.default = {
        default = true;
        locations."/".return = ''200 "Hello from idecl-poc"'';
      };
    };


    systemd.services.idecl =  {
      description = "daemon for idecl";
      after = [ "network.target" ];
      wantedBy = [ "multiuser.target" ];
      serviceConfig = {
        WorkingDirectory = "${idecl-src}/executors/simplejava";
        Environment = ''PYTHONPATH="${python-with-packages}/${python-with-packages.sitePackages}"'';
        ExecStart = "${pkgs.python3Packages.gunicorn}/bin/gunicorn app:app --bind 0.0.0.0";
#ExecStart = ''/bin/sh -c "echo $PYTHONPATH"'';
      };
    };
  };

}
