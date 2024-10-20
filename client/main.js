window.onload = function() {
  document.getElementById("run").addEventListener("click", function() {
    output = document.getElementById("output")
    xhr = new XMLHttpRequest();
    xhr.open("POST", "/run", true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        if(xhr.status != 200)
          output.textContent = "Error talking to server";
        else
          output.textContent = xhr.response;
        
      }
    }
    formdata = new FormData();
    formdata.append("file", document.getElementById("code").value)
    xhr.send(formdata);
  })
}
