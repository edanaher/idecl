var baseURL = function() { return (document.URL + "/").replace(/\/\/$/, "/"); }
var projectId = function() {
  p = document.URL.match(/projects\/([0-9]*)/)
  return p && parseInt(p[1]);
}
var localFileStore = function(filename) {
  var p = projectId();
  var prefix = "files|"
  if (p) {
    if (filename)
      return prefix + projectId() + "|" + filename;
    else
      return prefix + projectId();
  } else {
    if (filename)
      return "files." + filename;
    else
      return "files"
  }
}

var loadLS = function(type, project, file) {
  var key = type + "|" + project + (file === undefined ? "" : "|" + file);
  return localStorage.getItem(key);
}

var loadLSc = function(type, file) {
  return loadLS(type, projectId(), file);
}

var saveLS = function(type, project, file, contents) {
  if (contents === undefined) {
    contents = file;
    file = undefined
  }
  var key = type + "|" + project + (file === undefined ? "" : "|" + file);
  return localStorage.setItem(key, contents);
}

var saveLSc = function(type, file, contents) {
  return saveLS(type, projectId(), file, contents);
}

var rmLS = function(type, project, file) {
  var key = type + "|" + project + (file === undefined ? "" : "|" + file);
  return localStorage.removeItem(key);
}

var rmLSc = function(type, file) {
  return rmLS(type, projectId(), file);
}

var lastedittime = 0;
var edits = [["m", 0, 0, 0]];
var currenthistory = -1;
var currenthistoryfile = -1;

var displayeditstate = function() {
  var disp = document.getElementById("historystate");
  var cur = currenthistory == -1 ? edits.length - 1: currenthistory;
  if (!edits)
    disp.innerText = "";
  disp.innerText = cur + "/" + (edits.length - 1);
}

var serializeInt = function(n) {
  var str = "" + n;
  if (str.length <= 10)
    return (str.length - 1) + str + ".";
  return "abcdef"[str.length - 11] + str + ".";
}

var deserializeInt = function(s, i) {
  var c = s.charAt(i);
  var len;
  if (c < "a")
    len = parseInt(s.charAt(i));
  else
    len = "abcdef".indexOf(c) + 10;
  return [parseInt(s.slice(i + 1, i + len + 2)), i + len + 3];
}

var serializeString = function(s) {
  return serializeInt(s.length) + s + ".";
}

var deserializeString = function(s, i) {
  var len;
  [len, i] = deserializeInt(s, i);
  return [s.slice(i, i + len), i + len + 1];
}

var serializeEdits = function() {
  var strs = [];
  for (i = 0; i < edits.length; i++) {
    var str = "";
    var edit = edits[i];
    var extra = ""
    if (edit[0] == "i" || edit[0] == "d") // deleted contents
      extra = serializeString(edit[4]);
    else if (edit[0] == "l") // oldfile, newfile
      extra = serializeInt(edit[4][0]) + serializeInt(edit[4][1]);
    else if (edit[0] == "s") // row/column of other end of selection
      extra = serializeInt(edit[4].row) + serializeInt(edit[4].column);
    else if (edit[0] == "n") // id, oldname, newname
      extra = serializeInt(edit[4][0]) + serializeString(edit[4][1]) + serializeString(edit[4][2]);
    else if (edit[0] == "a") // lastid, id, newfilename
      extra = serializeInt(edit[4][0]) + serializeInt(edit[4][1]) + serializeString(edit[4][2]);
    else if (edit[0] == "r") // id, name, contents
      extra = serializeInt(edit[4][0]) + serializeString(edit[4][1]) + serializeString(edit[4][2]);
    strs.push(edit[0] + serializeInt(edit[1]) + serializeInt(edit[2]) + serializeInt(edit[3]) + extra);
  }
  return "v1" + strs.join(";");
}

var deserializeEdits = function(str) {
  if (str.slice(0, 2) != "v1")
    return [];

  var edits = [];
  var i = 2;
  while (i < str.length) {
    var type = str.charAt(i++);
    var time, row, col, extra = "";
    [time, i] = deserializeInt(str, i);
    [row, i] = deserializeInt(str, i);
    [col, i] = deserializeInt(str, i);
    if (type == "i" || type == "d")
      [extra, i] = deserializeString(str, i);
    if (type == "l") {
      var prev, cur;
      [prev, i] = deserializeInt(str, i);
      [cur, i] = deserializeInt(str, i);
      extra = [prev, cur];
    }
    if (type == "s") {
      var r, c;
      [r, i] = deserializeInt(str, i);
      [c, i] = deserializeInt(str, i);
      extra = {row: r, column: c};
    }
    if (type == "n") {
      var id, old, cur;
      [id, i] = deserializeInt(str, i);
      [old, i] = deserializeString(str, i);
      [cur, i] = deserializeString(str, i);
      extra = [id, old, cur]
    }
    if (type == "a") {
      var oldid, newid, filename;
      [oldid, i] = deserializeInt(str, i);
      [newid, i] = deserializeInt(str, i);
      [filename, i] = deserializeString(str, i);
      extra = [oldid, newid, filename]
    }
    if (type == "r") {
      var id, name, contents;
      [id, i] = deserializeInt(str, i);
      [name, i] = deserializeString(str, i);
      [contents, i] = deserializeString(str, i);
      extra = [id, name, contents]
    }
    edits.push([type, time, row, col, extra]);
    i++;
  }
  return edits;
}

var postinsertposition = function(edit) {
  if (edit[0] == "i" || edit[0] == "d") {
    var newlines = edit[4].match(/\n/g)
    if (newlines) {
      var col = edit[4].length - edit[4].lastIndexOf("\n") - 1;
      return [edit[2] + newlines.length, col];
    } else {
      return [edit[2], edit[3] + edit[4].length];
    }
  }
  return [edit[2], edit[3]];
}

// Log events:
//   [m]ove
//   [i]nsert
//   [d]elete
//   [s]elect
//   [l]oad file
//   [a]dd file
//   [r]emove file
//   re[n]ame file
//  *e[x]ecute file
var logedit = function(type, position, data) {
  if (currenthistory != -1)
    return;
  var now = Date.now();
  var row = null;
  var col = null;
  var overwrite = false;
  if (position) {
    row = position.row;
    col = position.column;
  }
  if (edits.length > 0 && type == "m") {
    var lastedit = edits[edits.length - 1];
    var [lastrow, lastcol] = postinsertposition(lastedit);
    if (lastedit[0] == "m" && lastrow == row && lastcol == col)
      return;
    if (lastedit[0] == "i" && lastrow == row && lastcol == col)
      return;
    if (lastedit[0] == "d" && lastedit[2] == row && lastedit[3] == col)
      return;
    if (lastedit[0] == "s" && lastrow == row && lastcol == col && now - lastedittime < 20)
      overwrite = true;
  }
  if (edits.length > 0 && type == "d") {
    var lastedit = edits[edits.length - 1];
    if (lastedit[0] == "m" && lastedit[2] == row && lastedit[3] == col)
      overwrite = true;
    if (lastedit[0] == "s" && lastedit[2] == row && lastedit[3] == col && now - lastedittime < 20)
      overwrite = true;
  }
  if (edits.length > 0 && type == "s") {
    var lastedit = edits[edits.length - 1];
    if (lastedit[0] == "s" && ((lastedit[2] == row && lastedit[3] == col) ||
        (lastedit[4].row == data.row && lastedit[4].column == data.column)) &&
        now - lastedittime < 20)
      overwrite = true;
  }
  if (edits.length > 0 && type == "l") {
    var lastedit = edits[edits.length - 1];
    if (lastedit[0] == "r" && now - lastedittime < 20)
      return;
  }
  if (overwrite) {
    lastedittime -= edits[edits.length -1][1];
    edits.pop();
  }
  edits.push([type, now - lastedittime, row, col, data]);
  console.log(type, now - lastedittime, row, col, data, "/", edits.length);
  lastedittime = now;
  displayeditstate();
}


var cursorupdate = function() {
  var anchor = editor.selection.getAnchor();
  var cursor = editor.selection.getCursor();
  if (anchor.row == cursor.row && anchor.column == cursor.column)
    logedit("m", cursor);
  else
    logedit("s", cursor, anchor);
}

autosavestate = {
  forcetime: null,
  timer: null
};
var autosave = function() {
  saveToServer();
  autosavestate.forcetime = null;
  autosavestate.timer = null;
}

var triggerautosave = function() {
  if (autosavestate.timer) {
    clearTimeout(autosavestate.timer);
    autosavestate.timer = setTimeout(autosave, Math.min(5000, autosavestate.forcetime - Date.now()));
  } else {
    autosavestate.forcetime = Date.now() + 30000;
    autosavestate.timer = setTimeout(autosave, 5000);
  }
}

var editorupdate = function(delta) {
  var action = delta.action[0];
  var text = delta.lines.join("\n");
  var type = delta.action[0] == "r" ? "d" : delta.action[0];
  logedit(type, delta.start, text);
  triggerautosave();
}

var saveFile = function() {
  // Don't save inherited files
  var fileid = document.querySelector(".filename.open").getAttribute("fileid");
  var attrs = loadLSc("attrs", fileid);
  if (attrs && (attrs.indexOf("i") != -1 || attrs.indexOf("r") != -1))
    return;
  // Only save at end of history.  Eventually history should be saving, but until then...
  if (currenthistory == -1) {
    saveLSc("files", fileid, editor.getValue());
    saveLSc("edits", serializeEdits());
  }
}

var checkHistoryReplay = function() {
  var filelistdiv = document.getElementById("filelist");
  var uifiles = filelistdiv.children;
  var localfiles = JSON.parse(loadLSc("files"));
  var valid = true;
  if (uifiles.length != Object.keys(localfiles).length) {
    console.log("Filelists different lengths: ", uifiles.length, Object.keys(localfiles));
    valid = false;
  }
  for (var i = 0; i < uifiles.length; i++) {
    var filediv = uifiles[i];
    var fileid = filediv.getAttribute("fileid");
    var sess = sessions[fileid];
    if (filediv.innerText != localfiles[fileid]) {
      console.log("Difference in file name", fileid, filediv.innerText, localfiles[fileid]);
      filediv.innerText = localfiles[fileid];
      valid = false;
    }
    if (!sess)
      continue;
    var restored = sess.getValue();
    var orig = loadLSc("files", fileid);
    if (restored != orig) {
      console.log("Difference in file contents", fileid, filediv.innerText, [JSON.stringify(restored), JSON.stringify(orig)]);
      sess.setValue(loadLSc("files", fileid));
      valid = false;
    }
  }
  if (valid)
    console.log("hist success");
  else
    alert("History fail");
}

var historymove = function(adjust) {
  if (!edits)
    return;
  var histlen = edits.length;
  if (currenthistory == -1 && adjust > 0 || currenthistory == 0 && adjust < 0)
    return;
  if (currenthistory == -1) {
    saveFile();
    currenthistory = edits.length - 1;
    currenthistoryfile = parseInt(document.querySelector(".filename.open").getAttribute("fileid"));
  } else {
    loadFile(currenthistoryfile, true);
  }
  if (adjust > 0)
    currenthistory += adjust;
  editor.setReadOnly(true);

  var edit = edits[currenthistory];
  if (adjust > 0) {
    if (edit[0] == "m") {
      editor.gotoLine(edit[2] + 1, edit[3]);
    } else if (edit[0] == "i") {
      editor.gotoLine(edit[2] + 1, edit[3]);
      editor.insert(edit[4]);
    } else if (edit[0] == "d") {
      var [row, col] = postinsertposition(edit);
      editor.session.replace(new ace.Range(edit[2], edit[3], row, col), "");
    } else if (edit[0] == "s") {
      editor.selection.setRange(new ace.Range(edit[2], edit[3], edit[4].row, edit[4].column));
    } else if (edit[0] == "l") {
      loadFile(edit[4][1]);
      editor.gotoLine(edit[2] + 1, edit[3]);
    } else if (edit[0] == "a") {
      var filenamediv = document.querySelector("#filelist .filename[fileid=\"" + edit[4][1] + "\"]");
      filenamediv.classList.remove("histdeleted");
      loadFile(edit[4][1], true);
      editor.gotoLine(edit[2] + 1, edit[3]);
    } else if (edit[0] == "n") {
      var filenamediv = document.querySelector("#filelist .filename[fileid=\"" + edit[4][0] + "\"]");
      filenamediv.innerText = edit[4][2];
    } else if (edit[0] == "r") {
      var filelist = document.getElementById("filelist");
      var filenamediv = document.querySelector("#filelist .filename[fileid=\"" + edit[4][0] + "\"]");
      loadFile(parseInt(filelist.children[0].getAttribute("fileid")), true);
      filelist.removeChild(filenamediv);
    }
  } else {
    if (edit[0] == "i") {
      var [row, col] = postinsertposition(edit);
      editor.session.replace(new ace.Range(edit[2], edit[3], row, col), "");
    } else if (edit[0] == "d" && adjust < 0) {
      editor.gotoLine(edit[2] + 1, edit[3]);
      editor.insert(edit[4]);
    } else if (edit[0] == "l") {
      loadFile(edit[4][0], true);
    } else if (edit[0] == "a") {
      var filenamediv = document.querySelector("#filelist .filename[fileid=\"" + edit[4][1] + "\"]");
      filenamediv.classList.add("histdeleted");
      loadFile(edit[4][0], true);
    } else if (edit[0] == "n") {
      var filenamediv = document.querySelector("#filelist .filename[fileid=\"" + edit[4][0] + "\"]");
      filenamediv.innerText = edit[4][1];
    } else if (edit[0] == "r") {
      var filelist = document.getElementById("filelist");
      var div = document.createElement("div");
      div.innerText = edit[4][1];
      div.classList.add("filename");
      div.setAttribute("fileid", edit[4][0]);
      div.addEventListener("click", loadFile);
      filelist.appendChild(div);
      div.classList.add("histundeleted");

      loadFile(edit[4][0], edit[4][2], true);
    }
    var prevedit = edits[currenthistory - 1];
    if (prevedit[0] == "m") {
      editor.gotoLine(prevedit[2] + 1, prevedit[3]);
    } else if (prevedit[0] == "i") {
      editor.gotoLine(prevedit[2] + 1, prevedit[3] + prevedit[4].length);
    } else if (prevedit[0] == "d") {
      editor.gotoLine(prevedit[2] + 1, prevedit[3]);
    } else if (prevedit[0] == "s") {
      editor.selection.setRange(new ace.Range(prevedit[2], prevedit[3], prevedit[4].row, prevedit[4].column));
    } else if (prevedit[0] == "n") {
      editor.gotoLine(prevedit[2] + 1, prevedit[3]);
    }
  }

  while (edits.length > histlen)
    edits.pop();
  if (adjust < 0)
    currenthistory += adjust;
  if (currenthistory >= edits.length - 1) {
    checkHistoryReplay();
    currenthistory = -1;
    editor.setReadOnly(false);
    displayeditstate();
    return;
  }
  displayeditstate();
}


var markDirty = function() {
  document.getElementById("savefiles").classList.add("dirty");
}

var renameFile = function(elem) {
  if (elem.classList.contains("editing"))
    return
  var attrs = loadLSc("attrs", elem.getAttribute("fileid"));
  if (attrs && (attrs.indexOf("r") != -1 || attrs.indexOf("i") != -1))
    return;

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

    var files = JSON.parse(loadLSc("files"));
    // TODO: we now store the id on the fildid attr.  Use it.
    for (var i in files)
      if (files[i] == name)
        files[i] = newname;
    saveLSc("files", JSON.stringify(files));

    logedit("n", editor.session.selection.getCursor(), [elem.getAttribute("fileid"), name, newname]);
  };
  editbox.addEventListener("blur", finishEdit);
  editbox.addEventListener("beforeinput", function(e) {
    if (e.inputType == "insertLineBreak")
      finishEdit();
  });
}

var fileContents = function(projectid, fileid) {
  var attrs = loadLS("attrs", projectid, fileid);
  if (attrs && attrs.indexOf("i") != -1) {
    var par = loadLS("parent", projectid);
    var parfile = loadLS("files", projectid, fileid);
    return fileContents(par.split("|")[0], parfile);
  } else {
    return loadLS("files", projectid, fileid);
  }
}

var fileForRun = function(projectid, fileid) {
  var attrs = loadLS("attrs", projectid, fileid);
  if (attrs && attrs.indexOf("i") != -1) {
    var par = loadLS("parent", projectid);
    return {"inherit": {"project": parseInt(par.split("|")[0]), "file": parseInt(fileid)}};
  } else {
    return {"contents": loadLS("files", projectid, fileid)}
  }
}

var loadFile = function(fileid, contents, savehistoryfile) {
  var filenamediv;
  if (typeof(fileid) == "number") {
    filenamediv = document.querySelector("#filelist .filename[fileid=\"" + fileid + "\"]");
  } else {
    if (this.classList.contains("open"))
      return renameFile(this);
    filenamediv = this;
    fileid = this.getAttribute("fileid");
  }
  var oldfileid = document.querySelector(".filename.open").getAttribute("fileid");
  document.querySelector(".filename.open").classList.remove("open");
  saveLSc("lastfile", fileid);
  var sess = sessions[fileid]
  if (!sess) {
    if (contents && contents != true)
      sess = ace.createEditSession(contents);
    else
      sess = ace.createEditSession(fileContents(projectId(), fileid));
    sess.setMode("ace/mode/java");
    sess.setUseWrapMode(true);
    sess.setOption("indentedSoftWrap", false);
    sess.on("change", editorupdate);
    sess.on("changeSelection", cursorupdate);
    sessions[fileid] = sess;
  }
  if (!contents)
    logedit("l", sess.selection.getCursor(), [parseInt(oldfileid), parseInt(fileid)]);
  editor.setSession(sess);
  displayeditstate();
  filenamediv.classList.add("open");
  if (currenthistory != -1 && (contents === true || savehistoryfile == true))
    currenthistoryfile = parseInt(fileid);
  if (currenthistory == -1) {
    var attrs = loadLSc("attrs", fileid);
    if (attrs && (attrs.indexOf("r") != -1 || attrs.indexOf("i") != -1))
      editor.setReadOnly(true);
    else
      editor.setReadOnly(false);
  }
}

var addFile = function() {
  var filenames = JSON.parse(loadLSc("files"));
  var max = -1;
  var nextId = 0;
  var oldfileid = document.querySelector(".filename.open").getAttribute("fileid");
  for (var f in filenames) {
    if (parseInt(f) >= nextId)
      nextId = parseInt(f) + 1;
    if (filenames[f] == "untitled")
      max = 0;
    else if (filenames[f].slice(0, 8) == "untitled")
      max = Math.max(max, parseInt(filenames[f].slice(8)));
  }
  var newfile = max == -1 ? "untitled" : "untitled" + (max + 1);
  filenames[nextId] = newfile;
  saveLSc("files", JSON.stringify(filenames));
  saveLSc("files", nextId, "")

  // TODO: dedup this with initFiles
  var filelist = document.getElementById("filelist");
  var div = document.createElement("div");
  div.innerText = newfile;
  div.classList.add("filename");
  div.setAttribute("fileid", nextId);
  filelist.appendChild(div);

  // TODO: dedup with loadFile
  document.querySelector(".filename.open").classList.remove("open");
  saveLSc("lastfile", nextId);
  div.classList.add("open");

  var sess = ace.createEditSession("");
  sess.setMode("ace/mode/java");
  sess.setUseWrapMode(true);
  sess.setOption("indentedSoftWrap", false);
  sess.on("change", editorupdate);
  sess.on("changeSelection", cursorupdate);
  sessions[nextId] = sess;
  editor.setSession(sess);

  logedit("a", sess.selection.getCursor(), [parseInt(oldfileid), nextId, newfile]);

  div.addEventListener("click", loadFile);
}

var removeFile = function() {
  var div = document.querySelector(".filename.open");
  var fileid = parseInt(div.getAttribute("fileid"));
  var filename = div.innerText;

  if (!confirm("Are you sure you want to delete " + filename + "?"))
    return;

  logedit("r", editor.session.selection.getCursor(), [fileid, filename, loadLSc("files", fileid)]);
  var filelist = document.getElementById("filelist");

  // TODO: handle deleting first file.
  loadFile.call(filelist.children[0]);
  filelist.removeChild(div);

  rmLSc("files", fileid);
  rmLSc("attrs", fileid);

  var filenames = JSON.parse(loadLSc("files"));
  delete filenames[fileid];
  saveLSc("files", JSON.stringify(filenames));
}

var saveToServer = function() {
  saveFile();
  var savebutton = document.getElementById("savefiles");
  savebutton.innerText = "Saving..."
  var xhr = new XMLHttpRequest();
  xhr.open("POST", baseURL() + "save", true);
  xhr.setRequestHeader("Content-Type", "application/json");
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
  var postdata = {};
  var filenames = JSON.parse(loadLSc("files"));
  var par= loadLSc("parent");
  if (par)
    postdata["parent"] = par;
  postdata["files"] = {};
  for (var i in filenames)
    postdata.files[i] = {
      "name": filenames[i],
      "contents": loadLSc("files", i),
      "attrs": loadLSc("attrs", i) || ""
  };
  // TODO: save history
  xhr.send(JSON.stringify(postdata));
}

var loadFromServer = function(pid) {
  if (pid === undefined)
    pid = projectId();
  var loadbutton = document.getElementById("loadfiles");
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/projects/" + pid + "/load", true);
  xhr.onerror = function() {
    loadbutton.textContent = "Error talking to server";
  }
  xhr.onload = function() {
    var serverResponse = JSON.parse(xhr.response);
    var serverFiles = serverResponse.files || {}
    if (Object.keys(serverFiles).length == 0) {
      // this is a bit hacky, but makes some sense.  If there's no server save
      // or local save, bootstrap it.
      if (!loadLSc("files")) {
        bootstrapStorage();
        initFiles();
      }
      else
        loadbutton.innerText = "no server save";
      document.getElementById("savefiles").classList.remove("dirty");
      return;
    }

    // TODO: dedupe with reset
    var filenames = loadLS("files", pid);
    rmLS("files", pid);

    for (var i in filenames)
      rmLS("files", pid, i);

    if (pid == projectId()) {
      var filelist = document.getElementById("filelist");
      while (filelist.firstChild)
        filelist.removeChild(filelist.lastChild);
      sessions = [];
    }

    // TODO: load history

    // Do this somewhere better?
    filenames = {};
    for (var i in serverFiles) {
      saveLS("files", pid, i, serverFiles[i].contents);
      if (serverFiles[i].attrs)
        saveLS("attrs", pid, i, serverFiles[i].attrs);
      filenames[i] = serverFiles[i].name;
    }

    saveLS("files", pid, JSON.stringify(filenames));

    if (serverResponse.parent) {
      saveLS("parent", pid, serverResponse.parent);
    }
    if (pid == projectId()) {
      initFiles();
      loadbutton.innerText = "load";
      document.getElementById("savefiles").classList.remove("dirty");
    }
  }
  xhr.send();
  loadbutton.innerText = "loading";

  return
}

websocket = undefined;
var runcommand = function(test) {
  if (websocket) {
    websocket.send(JSON.stringify({"kill": true}))
    return;
  }
  saveFile();
  var runbutton = document.getElementById(test ? "runtests" : "run");
  var otherrunbutton = document.getElementById(!test ? "runtests" : "run");
  runbutton.innerText = test ? "stop running tests..." : "stop running...";
  otherrunbutton.setAttribute("disabled", "");
  var params = test ? "?test=1" : ""

  var body = {};
  var filenames = JSON.parse(loadLSc("files"))
  for (var i in filenames)
    body[filenames[i]] = fileForRun(projectId(), i);

  websocket = webSocketConnect({"op": "run", "pid": projectId(), "files": body, "test": test}, function(data) {
    if (data.container)
      container = data.container;
    if (data.output)
      term.write(data.output);
    if (data.status)
      document.getElementById("runstatus").innerText = data.status;
    if (data.complete) {
      websocket = null;
      term.options.cursorStyle = "underline";
      term.options.cursorInactiveStyle = "none";
      runbutton.innerText = test ? "run tests" : "run";
      otherrunbutton.removeAttribute("disabled");
    }
  });

  term.options.cursorStyle = "block";
  term.options.cursorInactiveStyle = "bar";
  document.getElementById("runstatus").innerText = "starting..."
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
  xhr.open("POST", "/containers/" + container + "/stdin", true);
  xhr.onload = function() {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      document.getElementById("sendinput").disabled = false;
      if(xhr.status != 200) {
        term.clear();
        term.write("Error sending stdin to server\n");
      }
    }
  };
  var formdata = new FormData();
  formdata.append("input", document.getElementById("stdin").value)
  xhr.send(formdata);
}


var sendinputfromterminal = (function() {
  var buffer = "";
  return function(content) {
    if (content == "\r") {
      websocket.send(JSON.stringify({"input": buffer + content}));
      buffer = "";
    } else if (content == "\x7f") {
      buffer = buffer.slice(0, buffer.length - 1);
    } else {
      buffer += content;
    }
  };
})();


var bootstrapStorage = function() {
    localStorage.setItem("version", 0);
    saveLSc("files", JSON.stringify(["Main.java", "Num.java", "TestNum.java"]));
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
  upgradestore();
}

var resetFiles = function() {
  if (!confirm("Are you sure you want to reset all your files to the defaults?  This cannot be undone."))
    return;
  if (confirm("Really?  Click Cancel to reset; OK will leave your files."))
    return;

  var filenames = JSON.parse(loadLSc("files"));
  rmLSc("files");

  for (var i in filenames) {
    rmLSc("files", i);
  }
  rmLSc("edits");

  var filelist = document.getElementById("filelist");
  while (filelist.firstChild)
    filelist.removeChild(filelist.lastChild);
  sessions = {};

  bootstrapStorage();
  initFiles();
}

var cloneProject = function(from, to, assignment) {
  var files = JSON.parse(loadLS("files", from));
  var filenames = {}
  for (f in files)
    filenames[files[f]] = true;
  var newfiles = {}
  var templated = {};
  for (f in files) {
    var newname = files[f];
    if (assignment) {
      if ("template/" + files[f] in filenames)
        continue;
      if (newname.startsWith("template/")) {
        newname = newname.replace("template/", "");
        templated[f] = true;
      }
    }
    newfiles[f] = newname;
  }
  saveLS("files|", to, JSON.stringify(newfiles));
  // TODO: Link to specific history number to track pre-clone history
  saveLS("parent", to, from + "|" + 0);
  for (var f in newfiles) {
    var contents = loadLS("files", from, f);
    saveLS("files", to, f, contents);
    if (assignment) {
      var attrs = "";
      if (files[f].startsWith("Test") || files[f].endsWith("Test.java") || files[f].endsWith("Tests.java")) {
        saveLS("files", to, f, f);
        attrs = attrs.concat("hi");
      }
      if (!templated[f])
        attrs = attrs.concat("r");

      if (attrs != "")
        saveLS("attrs", to, f, attrs);
    }
  }
}

var cloneProjectInit = function(assignment) {
  var name = prompt("What is the new project name?");

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/classrooms/" + classroom_id + "/projects", true);
  xhr.onload = function() {
    var pid = xhr.response;
    cloneProject(projectId(), pid, assignment);
    alert("Cloned to project " + name);
  };
  var formdata = new FormData();
  formdata.append("name", name);
  formdata.append("parent", projectId());
  xhr.send(formdata);
}

// TODO: dedupe these
var publish = function() {
  var publish_button = this;
  if (this.hasAttribute("published")) {
    var xhr = new XMLHttpRequest();
    xhr.open("DELETE", "/projects/" + projectId() + "/tags/1", true);
    xhr.onload = function() {
      publish_button.disabled = false;
      publish_button.innerText = "publish project";
      publish_button.removeAttribute("published");
    };
    this.innerText = "unpublishing..."
    this.disabled = true;
    xhr.send();
  } else {
    var xhr = new XMLHttpRequest();
    xhr.open("PUT", "/projects/" + projectId() + "/tags/1", true);
    xhr.onload = function() {
      publish_button.disabled = false;
      publish_button.innerText = "unpublish project";
      publish_button.setAttribute("published", "");
    };
    this.innerText = "publishing..."
    this.disabled = true;
    xhr.send();
  }
}
var submit = function() {
  saveToServer()
  var submit_button = this;
  if (this.hasAttribute("submitted")) {
    var xhr = new XMLHttpRequest();
    xhr.open("DELETE", "/projects/" + projectId() + "/tags/2", true);
    xhr.onload = function() {
      submit_button.disabled = false;
      submit_button.innerText = "submit project";
      submit_button.removeAttribute("submitted");
    };
    this.innerText = "unsubmitting..."
    this.disabled = true;
    xhr.send();
  } else {
    var xhr = new XMLHttpRequest();
    xhr.open("PUT", "/projects/" + projectId() + "/tags/2", true);
    xhr.onload = function() {
      submit_button.disabled = false;
      submit_button.innerText = "unsubmit project";
      submit_button.setAttribute("submitted", "");
    };
    this.innerText = "submitting..."
    this.disabled = true;
    xhr.send();
  }
}

var upgradestore = function() {
  var version = localStorage.getItem("version");
  if (!version)
    version = "0";
  version = parseInt(version);

  if (version == 0) {
    var files = JSON.parse(loadLSc("files"));
    var lastfile = loadLSc("lastfile");
    if (Array.isArray(files)) {
      var filemap = {};
      for (var i = 0; i < files.length; i++)
        filemap[i] = files[i];
      saveLSc("files", JSON.stringify(filemap));
      files = filemap;
    }
    for (var i in files) {
      var oldkey = "files|" + projectId() + "|" + files[i];
      var oldcontents = loadLSc("files", files[i]);
      if (oldcontents) {
        saveLSc("files", i, oldcontents);
        rmLSc("files", files[i]);
      }
      if (lastfile == files[i])
        saveLSc("lastfile", i);
    }
  }

  localStorage.setItem("version", 1);
}

var initFiles = function() {
  var lastfile = loadLSc("lastfile");
  var filenames = JSON.parse(loadLSc("files"));
  var filelist = document.getElementById("filelist");

  var opened = false;
  for(f in filenames) {
    var attrs = loadLSc("attrs", f);
    if (attrs && attrs.indexOf("h") != -1)
      continue;
    var div = document.createElement("div");
    div.innerText = filenames[f];
    div.classList.add("filename");
    div.setAttribute("fileid", f);
    if (f == lastfile) {
      div.classList.add("open");
      opened = true;
    }
    if (attrs && (attrs.indexOf("r") != -1 || attrs.indexOf("i") != -1))
      div.classList.add("readonly");
    filelist.appendChild(div);
  }
  if (!opened && filelist.children.length > 0) {
    filelist.children[0].classList.add("open")
    lastfile = filelist.children[0].getAttribute("fileid");
  }

  var sess = ace.createEditSession(loadLSc("files", lastfile));
  sess.setMode("ace/mode/java");
  sess.setUseWrapMode(true);
  sess.setOption("indentedSoftWrap", false);
  sess.on("change", editorupdate);
  sess.on("changeSelection", cursorupdate);
  editor.setSession(sess);
  sessions[lastfile] = sess;
  var attrs = loadLSc("attrs", lastfile);
  if (attrs && (attrs.indexOf("r") != -1 || attrs.indexOf("i") != -1))
    editor.setReadOnly(true);
  else
    editor.setReadOnly(false);

  edits = loadLSc("edits");
  if (edits)
    edits = deserializeEdits(edits);
  else
    edits = [["m", 0, 0, 0]];
  displayeditstate();

  filenames = document.getElementsByClassName("filename");
  for (var i = 0; i < filenames.length; i++)
    filenames[i].addEventListener("click", loadFile);
}

var initAce = function() {
  editor = ace.edit("code");
  sessions = {}
}

var initTerminal = function() {
  term = new Terminal({
    convertEol: true,
    cursorBlink: false,
    cursorStyle: "underline",
    cursorInactiveStyle: "none",
    disableStdin: false,
    theme: {
      foreground: "black",
      background: "white",
      cursor: "gray",
      selectionBackground: "lightgray"
    },
    fontFamily: "monospace",
    fontSize: "14"

  });
  term.fit = new FitAddon.FitAddon();
  term.loadAddon(term.fit);
  term.open(document.getElementById("terminal"));
  for (var i = 0; i < 50; i++)
    term.fit.fit();
  term.prompt = function() {
    console.log("prompt");
  }
  term.onKey(function(k, ev) {
    if (!websocket)
      return;
    if (k.key == "\r")
      term.write("\n\r");
    else if (k.key == "\x7f")
      term.write("\b \b");
    else
      term.write(k.key);
    sendinputfromterminal(k.key);
  })
  var resizeTimer = null;
  window.addEventListener("resize", function() {
    if (resizeTimer)
      clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      console.log("resize");
      for (var i = 0; i < 50; i++)
        term.fit.fit();
      resizeTimer = null;
    }, 50);
  });
}

var switchlayout = function() {
  var layouts = ["split", "fullscreencode", "fullscreenconsole"];
  var maincontent = document.getElementById("maincontent")

  var cur = maincontent.getAttribute("layout");
  var i = layouts.indexOf(cur);
  var next = (i + 1) % layouts.length;
  maincontent.setAttribute("layout", layouts[next]);
  for (var i = 0; i < 50; i++)
    term.fit.fit();
}

var addClickListenerById = function(id, f) {
  var elem = document.getElementById(id);
  if (elem)
    elem.addEventListener("click", f);
}

var webSocketConnect = function(message, onmessage) {
  var websocket
  if (location.protocol == "https:")
    websocket = new WebSocket("wss://" + location.host + "/websocket/");
  else
    websocket = new WebSocket("ws://" + location.host + "/websocket/");
  websocket.onopen = function () {
    websocket.send(JSON.stringify(message))
  };
  websocket.onerror = function (error) {
    console.log(error);
  };
  websocket.onmessage = function (e) {
    var parsed = JSON.parse(e.data)
    return onmessage(parsed);
  };
  websocket.onclose = function () {
    // TODO: attempt reconnect if appropriate
  };
  return websocket;
}

window.onload = function() {
  initAce();
  initTerminal();
  upgradestore();
  if (!loadLSc("files"))
    loadFromServer(projectId(), true);
  else {
    initFiles();
  }
  addClickListenerById("run", runcode);
  addClickListenerById("runtests", runtests);
  //document.getElementById("sendinput").addEventListener("click", sendinput);
  addClickListenerById("view-as-self", function() {
      document.cookie = "sudo=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT";
      window.location.replace("/");
  });
  editor.on("blur", saveFile);
  editor.on("change", markDirty);
  addClickListenerById("cloneproject", function() { cloneProjectInit(false); });
  addClickListenerById("cloneassignment", function() { cloneProjectInit(true) });
  addClickListenerById("publish", publish);
  addClickListenerById("submit", submit);
  addClickListenerById("addfile", addFile);
  addClickListenerById("removefile", removeFile);
  addClickListenerById("savefiles", saveToServer);
  addClickListenerById("loadfiles", function() { loadFromServer() });
  addClickListenerById("resetfiles", resetFiles);
  addClickListenerById("historyback", function() { historymove(-1); });
  addClickListenerById("historyforward", function() { historymove(1); });
  addClickListenerById("switchlayout", switchlayout);
  addClickListenerById("clearterminal", function() { term.clear(); document.getElementById("runstatus").innerText = ""; });
}
