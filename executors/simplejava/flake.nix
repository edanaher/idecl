{
  inputs = {
    utils.url = "github:numtide/flake-utils";
  };
  outputs = { self, nixpkgs, utils }: utils.lib.eachDefaultSystem (system:
    let
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShell = pkgs.mkShell {
        buildInputs = with pkgs; [
          python3 python3Packages.flask python3Packages.flask-login python3Packages.requests
          python3Packages.gunicorn python3Packages.sqlalchemy
          jdk
        ];
      };
      packages.idecl-java-runner = pkgs.dockerTools.buildImage {
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
    }
  );
}
