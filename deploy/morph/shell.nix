{ pkgs ? import <nixpkgs> { } }:
let
  myTerraform = pkgs.terraform.withPlugins (tp: [ tp.digitalocean ]);
  update-terraform-json = pkgs.writeShellScriptBin "update-terraform-json" ''
    terraform show -json > terraform-out.json
  '';
in
pkgs.mkShell {
  buildInputs = with pkgs; [ curl jq morph myTerraform update-terraform-json ];
}

