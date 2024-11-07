var baseURL = function() { return (document.URL + "/").replace(/\/\/$/, "/"); }
var projectId = function() {
  p = document.URL.match(/projects\/([0-9]*)/)
  return p && parseInt(p[1]);
}
var localFileStore = function(filename) {
  var p = projectId();
  if (p) {
    if (filename)
      return "files|" + projectId() + "|" + filename;
    else
      return "files|" + projectId();
  } else {
    if (filename)
      return "files." + filename;
    else
      return "files"
  }
}

var lastedittime = 0;
var edits = [];
var logedit = function(type, position, data) {
  var now = Date.now();
  var row = null;
  var col = null;
  if (position) {
    row = position.row;
    col = position.column;
  }
  edits.push([type, now - lastedittime, row, col, data]);
  console.log(type, now - lastedittime, row, col, data);
  lastedittime = now;
}

var cursorupdate = function(e) {
  logedit("m", editor.selection.getCursor())
}
var editorupdate = function(delta) {
  var action = delta.action[0];
  var text = delta.lines.join("\n");
  console.log(delta, delta.start, delta.start.row)
  logedit(delta.action[0], delta.start, text);
}

var saveFile = function() {
  var filename = document.querySelector(".filename.open").innerText;
  localStorage.setItem(localFileStore(filename), editor.getValue());
}

var currenthistory = -1;
var historymove = function(adjust) {
  var histlen = edits.length;
  if (currenthistory == -1)
    currenthistory = edits.length;
  currenthistory += adjust;
  console.log(currenthistory, "/", edits.length);
  if (currenthistory < 0) {
    currenthistory = 0;
    return;
  }
  if (currenthistory >= edits.length) {
    currenthistory = edits.length - 1;
    return;
  }

  var edit = edits[currenthistory];
  if (edit[0] == "m" && adjust > 0) {
    editor.moveCursorTo(edit[2], edit[3]);
  } else if (edit[0] == "m" && adjust < 0) {
    if (currenthistory == 0)
      editor.moveCursorTo(0, 0);
    else {
      var prev = edits[currenthistory - 1];
      editor.moveCursorTo(prev[2], prev[3]);
    }
  } else if (edit[0] == "i" && adjust > 0 || edit[0] == "r" && adjust < 0) {
    console.log("Inserting ", edit[4]);
    editor.insert(edit[4]);
  } else if (edit[0] == "i" && adjust < 0 || edit[0] == "r" && adjust > 0) {
    console.log("Deleting ", edit[2], ",", edit[3], "len", edit[4].length);
    editor.session.replace(new ace.Range(edit[2], edit[3], edit[2], edit[3] + edit[4].length), "");
  }
  while (edits.length > histlen)
    edits.pop();
}

var markDirty = function() {
  document.getElementById("savefiles").classList.add("dirty");
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
  var finishEdit = function() {
    var newname = editbox.value;
    elem.removeChild(editbox);
    elem.innerText = editbox.value;
    elem.classList.remove("editing");

    if (newname == name)
      return;

    var files = JSON.parse(localStorage.getItem(localFileStore()));
    for (var i = 0; i < files.length; i++)
      if (files[i] == name)
        files[i] = newname;
    localStorage.setItem(localFileStore(), JSON.stringify(files));
    localStorage.setItem("lastfile|" + projectId(), newname);

    var contents = localStorage.getItem(localFileStore(name));
    localStorage.setItem(localFileStore(newname), contents);
    localStorage.removeItem(localFileStore(name));
    sessions[newname] = sessions[name];
    delete sessions[name]
  };
  editbox.addEventListener("blur", finishEdit);
  editbox.addEventListener("beforeinput", function(e) {
    if (e.inputType == "insertLineBreak")
      finishEdit();
  });
}

var loadFile = function() {
  if (this.classList.contains("open"))
    return renameFile(this);
  document.querySelector(".filename.open").classList.remove("open");
  localStorage.setItem("lastfile|" + projectId(), this.innerText);
  var sess = sessions[this.innerText]
  if (!sess) {
    sess = ace.createEditSession(localStorage.getItem(localFileStore(this.innerText)));
    sess.setMode("ace/mode/java");
    sess.on("change", editorupdate);
    sess.on("changeSelection", cursorupdate);
    sessions[this.innerText] = sess;
  }
  editor.setSession(sess);
  this.classList.add("open");
}

var addFile = function() {
  var filenames = JSON.parse(localStorage.getItem(localFileStore()));
  var max = -1;
  for (var f in filenames) {
    if (filenames[f] == "untitled")
      max = 0;
    else if (filenames[f].slice(0, 8) == "untitled")
      max = Math.max(max, parseInt(filenames[f].slice(8)));
  }
  var newfile = max == -1 ? "untitled" : "untitled" + (max + 1);
  filenames.push(newfile)
  localStorage.setItem(localFileStore(), JSON.stringify(filenames));
  localStorage.setItem(localFileStore(newfile), "");

  // TODO: dedup this with initFiles
  var filelist = document.getElementById("filelist");
  var div = document.createElement("div");
  div.innerText = newfile;
  div.classList.add("filename");
  filelist.appendChild(div);

  // TODO: dedup with loadFile
  document.querySelector(".filename.open").classList.remove("open");
  localStorage.setItem("lastfile|" + projectId(), div.innerText);
  editor.setValue(localStorage.getItem(localFileStore(div).innerText));
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

  localStorage.removeItem(localFileStore(filename));

  var filenames = JSON.parse(localStorage.getItem(localFileStore()));
  filenames.splice(filenames.indexOf(filename), 1);
  localStorage.setItem(localFileStore(), JSON.stringify(filenames));

}

var saveToServer = function() {
  saveFile();
  var savebutton = document.getElementById("savefiles");
  savebutton.innerText = "Saving..."
  var xhr = new XMLHttpRequest();
  xhr.open("POST", baseURL() + "save", true);
  xhr.onprogress = function() {
    if (xhr.readyState === XMLHttpRequest.DONE || xhr.readyState === XMLHttpRequest.LOADING) {
      if(xhr.status != 200)
        savebutton.innerText = "Error talking to server";
      else {
        savebutton.innerText = "save";
        document.getElementById("savefiles").classList.remove("dirty");
      }
    }
  };
  var formdata = new FormData();
  var filenames = JSON.parse(localStorage.getItem(localFileStore()))
  for (var i = 0; i < filenames.length; i++)
    formdata.append(filenames[i], localStorage.getItem(localFileStore(filenames[i])));
  xhr.send(formdata);
}

var loadFromServer = function() {
  var loadbutton = document.getElementById("loadfiles");
  var xhr = new XMLHttpRequest();
  xhr.open("GET", baseURL() + "load", true);
  xhr.onerror = function() {
    loadbutton.textContent = "Error talking to server";
  }
  xhr.onload = function() {
    var serverFiles = JSON.parse(xhr.response); 

    // TODO: dedupe with reset
    var filenames = JSON.parse(localStorage.getItem(localFileStore()));
    sessions = [];
    localStorage.removeItem(localFileStore(), "");

    for (var i = 0; i < filenames.length; i++)
      localStorage.removeItem(localFileStore(filenames[i]));

    var filelist = document.getElementById("filelist");
    while (filelist.firstChild)
      filelist.removeChild(filelist.lastChild);

    // Do this somewhere better?
    filenames = [];
    for (var i = 0; i < serverFiles.length; i++) {
      localStorage.setItem(localFileStore(serverFiles[i].name), serverFiles[i].contents);
      filenames = filenames.concat(serverFiles[i].name);
    }

    localStorage.setItem(localFileStore(), JSON.stringify(filenames));
    localStorage.setItem("lastfile|" + projectId(), serverFiles[0].name);

    initFiles();
    loadbutton.innerText = "load";
    document.getElementById("savefiles").classList.remove("dirty");
  }
  xhr.send();
  loadbutton.innerText = "loading";

  return
}

var runcommand = function(test) {
  saveFile();
  container = undefined;
  var runbutton = document.getElementById(test ? "runtests" : "run");
  runbutton.innerText = test ? "running tests..." :"running...";
  var output = document.getElementById("output");
  var xhr = new XMLHttpRequest();
  var params = test ? "?test=1" : ""
  xhr.open("POST", "/run" + params, true);
  xhr.onprogress = function() {
    if (xhr.readyState === XMLHttpRequest.DONE || xhr.readyState === XMLHttpRequest.LOADING) {
      if(xhr.status != 200)
        output.textContent = "Error talking to server";
      else {
        i = xhr.response.indexOf("\n");
        if (i)
          container = xhr.response.slice(0, i);
        output.textContent = xhr.response.slice(i + 1);
      }
    }
  };
  xhr.onload = function() {
    xhr.onprogress();
    runbutton.innerText = test ? "run tests" : "run";
    document.getElementById("sendinput").disabled = true;
  }
  var formdata = new FormData();
  var filenames = JSON.parse(localStorage.getItem(localFileStore()))
  for (var i = 0; i < filenames.length; i++)
    formdata.append(filenames[i], localStorage.getItem(localFileStore(filenames[i])));
  xhr.send(formdata);
  document.getElementById("sendinput").disabled = false;
}

var runcode = function() {
  runcommand(false);
}

var runtests = function() {
  runcommand(true);
}

var sendinput = function() {
  document.getElementById("sendinput").disabled = true;
  var stdin = document.getElementById("stdin");
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/" + container + "/stdin", true);
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
    localStorage.setItem(localFileStore(), JSON.stringify(["Main.java", "Num.java", "TestNum.java"]));
    localStorage.setItem("lastfile|" + projectId(), "Main.java");
    localStorage.setItem(localFileStore("Main.java"), `import java.util.Scanner;

public class Main {
  public static void main(String args[]) {
    System.out.println("Hello!");
    try {
      Thread.sleep(1000);
    } catch(Exception e) {}
    System.out.println("What's your name?");
    Scanner input = new Scanner(System.in);
    System.out.println("Hello, " + input.next() + "!");
    System.out.println("11 + 23 is " + Num.add(11, 23));
  }
}
`);
  localStorage.setItem(localFileStore("Num.java"), `public class Num {
  public static int add(int a, int b) {
    return a + b;
  }
}`);
  localStorage.setItem(localFileStore("TestNum.java"), `import org.junit.*;
import static org.junit.Assert.*;

public class TestNum
{

  @Test
  public void checkAdd()
  {
    assertEquals("1 plus 2", 3, Num.add(1, 2));
    assertEquals("5 plus 8", 13, Num.add(5, 8));
  }
}`);
}

var resetFiles = function() {
  if (!confirm("Are you sure you want to reset all your files to the defaults?  This cannot be undone."))
    return;
  if (confirm("Really?  Click Cancel to reset; OK will leave your files."))
    return;

  var filenames = JSON.parse(localStorage.getItem(localFileStore()));
  localStorage.removeItem(localFileStore(), "");

  for (var i = 0; i < filenames.length; i++)
    localStorage.removeItem(localFileStore(filenames[i]));

  var filelist = document.getElementById("filelist");
  while (filelist.firstChild)
    filelist.removeChild(filelist.lastChild);

  bootstrapStorage();
  initFiles();
}


var initFiles = function() {
  var lastfile = localStorage.getItem("lastfile|" + projectId());
  var filenames = JSON.parse(localStorage.getItem(localFileStore()));
  var filelist = document.getElementById("filelist");

  var opened = false;
  for(f in filenames) {
    var div = document.createElement("div");
    div.innerText = filenames[f];
    div.classList.add("filename");
    if (filenames[f] == lastfile) {
      div.classList.add("open");
      opened = true;
    }
    filelist.appendChild(div);
  }
  if (!opened) {
    filelist.children[0].classList.add("open")
    lastfile = filelist.children[0].innerText
  }

  var sess = ace.createEditSession(localStorage.getItem(localFileStore(lastfile)));
  sess.setMode("ace/mode/java");
  sess.on("change", editorupdate);
  sess.on("changeSelection", cursorupdate);
  editor.setSession(sess);
  sessions[lastfile] = sess;

  filenames = document.getElementsByClassName("filename");
  for (var i = 0; i < filenames.length; i++)
    filenames[i].addEventListener("click", loadFile);
}

var initAce = function() {
  editor = ace.edit("code");
  sessions = {}
}

window.onload = function() {
  if (!localStorage.getItem(localFileStore()))
    bootstrapStorage();
  initAce();
  initFiles();
  document.getElementById("run").addEventListener("click", runcode);
  document.getElementById("runtests").addEventListener("click", runtests);
  document.getElementById("sendinput").addEventListener("click", sendinput);
  editor.on("blur", saveFile);
  editor.on("change", markDirty);
  document.getElementById("addfile").addEventListener("click", addFile);
  document.getElementById("removefile").addEventListener("click", removeFile);
  document.getElementById("savefiles").addEventListener("click", saveToServer);
  document.getElementById("loadfiles").addEventListener("click", loadFromServer);
  document.getElementById("resetfiles").addEventListener("click", resetFiles);
  document.getElementById("historyback").addEventListener("click", function() { historymove(-1); });
  document.getElementById("historyforward").addEventListener("click", function() { historymove(1); });
}
