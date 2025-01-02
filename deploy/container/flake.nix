# See how this flake is used in ./usage.sh
{
  inputs.extra-container.url = "github:erikarvstedt/extra-container";
  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

  outputs = { extra-container, ... }@inputs: 
    let src-path = "/home/edanaher/proj/idecl"; in
    extra-container.lib.eachSupportedSystem (system: {
      packages.default = extra-container.lib.buildContainers {
        # The system of the container host
        inherit system;

        # Only set this if the `system.stateVersion` of your container
        # host is < 22.05
        legacyInstallDirs = true;

        # Optional: Set nixpkgs.
        # If unset, the nixpkgs input of extra-container flake is used
        #nixpkgs = inputs.nixpkgs;

        # Set this to disable `nix run` support
        # addRunner = false;

        config = {
          containers.idecl = {
            extra.addressPrefix = "10.250.0";


            # `specialArgs` is available in nixpkgs > 22.11
            # This is useful for importing flakes from modules (see nixpkgs/lib/modules.nix).
            # specialArgs = { inherit inputs; };

            bindMounts."${src-path}" = {
              hostPath = "/home/edanaher/proj/idecl";
              isReadOnly = true;
            };
            bindMounts."/var/run/docker.sock" = {
              hostPath = "/var/run/docker.sock";
              isReadOnly = false;
            };
            bindMounts."/tmp" = {
              hostPath = "/tmp";
              isReadOnly = false;
            };
            bindMounts."/app" = {
              hostPath = "/tmp/idecl-store";
              isReadOnly = false;
            };
            bindMounts."/var/run/idecl" = {
              hostPath = "/var/run/idecl";
              isReadOnly = false;
            };

            config = let
              idecl-port = 9453;
              idecl-src = src-path;
              in { config, pkgs, ... }:
              let common = import ../common.nix { inherit pkgs idecl-port idecl-src; hostname = "localhost"; usessl = false; }; in {
              users.groups.hostdocker = {
                gid = 131; # Change to your local docker group
                name = "hostdocker";
                members = [ "nginx" ];

              };
              systemd.services.nginx.serviceConfig.ProtectHome = false;
              services.nginx = common.nginx-config;
              environment.systemPackages = [ pkgs.sqlite-interactive ];
              systemd.services.idecl = let
                python-with-packages = common.python-with-packages;
                init-script = pkgs.writeShellScript "init-idecl" ''
                  export HOME=/app
                  mkdir -p /app
                  mkdir -p /var/run/idecl
                  cd ${idecl-src}/executors/simplejava
                  source ${src-path}/deploy/morph/secrets.sh
                  ${pkgs.python3Packages.alembic}/bin/alembic upgrade head
                  docker images -q idecl-java-runner:latest | grep . || docker load < ${idecl-java-runner} | ${pkgs.gawk}/bin/awk '{print $3}' | xargs -I {} docker tag {} idecl-java-runner
                  '';
                idecl-java-runner = common.idecl-java-runner;
              in {
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
                  ExecStart = "/bin/sh -c 'source ${src-path}/deploy/morph/secrets.sh && ${pkgs.python3Packages.flask}/bin/flask run --debug --port ${builtins.toString idecl-port}'";
                };
              };
              networking.firewall.allowedTCPPorts = [ 50 80 ];
            };
          };
        };
      };
    });
}
