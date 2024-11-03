variable "do_token" {}
provider "digitalocean" {
  token = var.do_token
}

resource "digitalocean_droplet" "idecl" {
  name     = "idecl${count.index + 1}"
  region   = "nyc1"
  size     = "s-1vcpu-512mb-10gb"
  image    = 169321333
  ssh_keys = [43972112]

  count = 1
}

