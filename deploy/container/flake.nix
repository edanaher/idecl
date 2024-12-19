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

            config = let
              idecl-port = 5000;
              idecl-src = src-path;
              in { config, pkgs, ... }: {
              networking.enableIPv6 = false;
              services.nginx = {
                enable = true;
                package = pkgs.openresty;
                virtualHosts."localhost" = {
                  default = true;
#                  locations."/static/" = {
#                    alias = "${idecl-src}/client/";
#                  };
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
                    proxy_set_header Host localhost:5000;
                    proxy_set_header X-Forwarded-For $remote_addr;
                    proxy_buffering off;
                    '';
                  };
                };
              };
              environment.systemPackages = [ pkgs.sqlite-interactive ];
              systemd.services.idecl = let
                python-with-packages = pkgs.python3.withPackages (pp: with pp; [
                  pp.flask pp.flask-login pp.requests
                  pp.sqlalchemy pp.alembic
                ]);
                init-script = pkgs.writeShellScript "init-idecl" ''
                  export HOME=/app
                  mkdir -p /app
                  cd ${idecl-src}/executors/simplejava
                  source ${src-path}/deploy/morph/secrets.sh
                  ${pkgs.python3Packages.alembic}/bin/alembic upgrade head
                  docker images -q idecl-java-runner:latest | grep . || docker load < ${idecl-java-runner} | ${pkgs.gawk}/bin/awk '{print $3}' | xargs -I {} docker tag {} idecl-java-runner
                  '';
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
