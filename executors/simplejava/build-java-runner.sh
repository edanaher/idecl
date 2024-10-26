nix build .#idecl-java-runner
docker load < result | awk '{print $3}' | xargs -I {} docker tag {} idecl-java-runner
