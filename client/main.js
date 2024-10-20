window.onload = function() {
  document.getElementById("run").addEventListener("click", function() {
    runbutton = document.getElementById("run");
    runbutton.innerText = "running...";
    output = document.getElementById("output");
    xhr = new XMLHttpRequest();
    xhr.open("POST", "/run", true);
    xhr.onprogress = function() {
      if (xhr.readyState === XMLHttpRequest.DONE || xhr.readyState === XMLHttpRequest.LOADING) {
        if(xhr.status != 200)
          output.textContent = "Error talking to server";
        else
          output.textContent = xhr.response;
        
      }
    };
    xhr.onload = function() {
      xhr.onprogress();
      runbutton.innerText = "run";
    }
    formdata = new FormData();
    formdata.append("file", document.getElementById("code").value)
    xhr.send(formdata);
  })
}
