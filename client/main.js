window.onload = function() {
  document.getElementById("run").addEventListener("click", function() {
    pid = 0;
    var runbutton = document.getElementById("run");
    runbutton.innerText = "running...";
    var output = document.getElementById("output");
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/run", true);
    xhr.onprogress = function() {
      if (xhr.readyState === XMLHttpRequest.DONE || xhr.readyState === XMLHttpRequest.LOADING) {
        if(xhr.status != 200)
          output.textContent = "Error talking to server";
        else {
          i = xhr.response.indexOf("\n");
          if (i)
            pid = parseInt(xhr.response.slice(0, i));
          output.textContent = xhr.response.slice(i + 1);
        }
        
      }
    };
    xhr.onload = function() {
      xhr.onprogress();
      runbutton.innerText = "run";
      document.getElementById("sendinput").disabled = true;
    }
    var formdata = new FormData();
    formdata.append("Main.java", document.getElementById("code").value)
    formdata.append("Num.java", document.getElementById("code2").value)
    xhr.send(formdata);
    document.getElementById("sendinput").disabled = false;
  })

  document.getElementById("sendinput").addEventListener("click", function() {
    document.getElementById("sendinput").disabled = true;
    var stdin = document.getElementById("stdin");
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/" + pid + "/stdin", true);
    xhr.onload = function() {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        document.getElementById("sendinput").disabled = false;
        if(xhr.status != 200)
          output.textContent += "Error sending stdin to server\n";
      }
    };
    var formdata = new FormData();
    formdata.append("input", document.getElementById("stdin").value)
    xhr.send(formdata);
  });
}
