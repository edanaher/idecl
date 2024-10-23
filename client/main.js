var saveFile = function() {
  var filename = document.querySelector(".filename.open").innerText;
  localStorage.setItem("files." + filename, document.getElementById("code").value);
}

var renameFile = function(elem) {
  if (elem.classList.contains("editing"))
    return
  elem.classList.add("editing");
  var name = elem.innerText;
  elem.innerText = ""
  var editbox = document.createElement("input");
  editbox.value = name;
  elem.appendChild(editbox);
  editbox.focus();
  editbox.addEventListener("blur", function() {
    var newname = editbox.value;
    elem.removeChild(editbox);
    elem.innerText = editbox.value;
    elem.classList.remove("editing");

    if (newname == name)
      return;

    var files = JSON.parse(localStorage.getItem("files"));
    for (var i = 0; i < files.length; i++)
      if (files[i] == name)
        files[i] = newname;
    localStorage.setItem("files", JSON.stringify(files));

    var contents = localStorage.getItem("files." + name);
    localStorage.setItem("files." + newname, contents);
    localStorage.removeItem("files." + name);
  });
}

var loadFile = function() {
  if (this.classList.contains("open"))
    return renameFile(this);
  document.querySelector(".filename.open").classList.remove("open");
  localStorage.setItem("lastfile", this.innerText);
  document.getElementById("code").value = localStorage.getItem("files." + this.innerText);
  this.classList.add("open");
}

var addFile = function() {
  var filenames = JSON.parse(localStorage.getItem("files"));
  var max = -1;
  for (var f in filenames) {
    if (filenames[f] == "untitled")
      max = 0;
    else if (filenames[f].slice(0, 8) == "untitled")
      max = Math.max(max, parseInt(filenames[f].slice(8)));
  }
  var newfile = max == -1 ? "untitled" : "untitled" + (max + 1);
  filenames.push(newfile)
  localStorage.setItem("files", JSON.stringify(filenames));
  localStorage.setItem("files." + newfile, "");

  // TODO: dedup this with initFiles
  var filelist = document.getElementById("filelist");
  var div = document.createElement("div");
  div.innerText = newfile;
  div.classList.add("filename");
  filelist.appendChild(div);

  // TODO: dedup with loadFile
  document.querySelector(".filename.open").classList.remove("open");
  localStorage.setItem("lastfile", div.innerText);
  document.getElementById("code").value = localStorage.getItem("files." + div.innerText);
  div.classList.add("open");

  div.addEventListener("click", loadFile);
}

var removeFile = function() {
  var div = document.querySelector(".filename.open");
  var filename = div.innerText;

  if (!confirm("Are you sure you want to delete " + filename + "?"))
    return;

  var filelist = document.getElementById("filelist");

  // TODO: handle deleting first file.
  loadFile.call(filelist.children[0]);
  filelist.removeChild(div);

  localStorage.removeItem("file." + filename);

  var filenames = JSON.parse(localStorage.getItem("files"));
  filenames.splice(filenames.indexOf(filename), 1);
  localStorage.setItem("files", JSON.stringify(filenames));

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
  var filenames = JSON.parse(localStorage.getItem("files"));
  if (!(lastfile in filenames))
    lastfile = filenames[0];
  document.getElementById("code").value = localStorage.getItem("files." + lastfile);
  var filelist = document.getElementById("filelist");

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
  document.getElementById("addfile").addEventListener("click", addFile);
  document.getElementById("removefile").addEventListener("click", removeFile);
  filenames = document.getElementsByClassName("filename");
  for (var i = 0; i < filenames.length; i++)
    filenames[i].addEventListener("click", loadFile);
}
