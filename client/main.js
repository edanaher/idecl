var saveFile = function() {
  var filename = document.querySelector(".filename.open").innerText;
  localStorage.setItem("files." + filename, document.getElementById("code").value);
}

var loadFile = function() {
  document.querySelector(".filename.open").classList.remove("open");
  localStorage.setItem("lastfile", this.innerText);
  document.getElementById("code").value = localStorage.getItem("files." + this.innerText);
  this.classList.add("open");
}

var runcode = function() {
  saveFile();
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
  var filenames = JSON.parse(localStorage.getItem("files"))
  for (var i = 0; i < filenames.length; i++)
    formdata.append(filenames[i], localStorage.getItem("files." + filenames[i]));
  formdata.append("Main.java", document.getElementById("code").value)
  xhr.send(formdata);
  document.getElementById("sendinput").disabled = false;
}

var sendinput = function() {
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
}

var bootstrapStorage = function() {
    localStorage.setItem("files", JSON.stringify(["Main.java", "Num.java"]));
    localStorage.setItem("lastfile", "Main.java");
    localStorage.setItem("files.Main.java", `import java.util.Scanner;

public class Main {
  public static void main(String args[]) {
    System.out.println("Hello!");
    try {
      //Thread.sleep(1000);
    } catch(Exception e) {}
    System.out.println("What's your name?");
    Scanner input = new Scanner(System.in);
    System.out.println("Hello, " + input.next() + "!");
  }
}
`);
  localStorage.setItem("files.Num.java", `// Num`);

}

var initFiles = function() {
  var lastfile = localStorage.getItem("lastfile");
  var filelist = document.getElementById("filelist");
  if (!lastfile in filelist)
    lastfile = filelist[0];
  document.getElementById("code").value = localStorage.getItem("files." + lastfile);
  var filenames = JSON.parse(localStorage.getItem("files"));

  for(f in filenames) {
    var div = document.createElement("div");
    div.innerText = filenames[f];
    div.classList.add("filename");
    if (filenames[f] == lastfile)
      div.classList.add("open");
    filelist.appendChild(div);
  }
}

window.onload = function() {
  if (!localStorage.getItem("files"))
    bootstrapStorage();
  initFiles();
  document.getElementById("run").addEventListener("click", runcode);
  document.getElementById("sendinput").addEventListener("click", sendinput);
  document.getElementById("code").addEventListener("blur", saveFile);
  filenames = document.getElementsByClassName("filename");
  for (var i = 0; i < filenames.length; i++)
    filenames[i].addEventListener("click", loadFile);
}
