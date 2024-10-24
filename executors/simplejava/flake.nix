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
          python3Packages.gunicorn
          jdk
        ];
      };
    }
  );
}
