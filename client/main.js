var baseURL = function() { return (document.URL + "/").replace(/\/\/$/, "/"); }
var markdownvisible;
var projectId = function() {
  p = document.URL.match(/projects\/([0-9]*)/)
  return p && parseInt(p[1]);
}
var db;
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
  try {
    return localStorage.setItem(key, contents);
  } catch (error) {
    logError(null, error);
  }
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

var loadIDB = function(tabl, project, file) {
  return new Promise(function(resolve, reject) {
    var key;
    if (file !== undefined)
      key = project + "." + file;
    else
      key = project;
    var trans = db.transaction([tabl], "readonly");
    var table = trans.objectStore(tabl);
    var req = table.get(key)
    req.onerror = function(error) {
      logError(null, error);
      if (reject)
        reject();
    };
    req.onsuccess = function(e) {
      resolve(req.result);
    };
  });
}

var loadIDBc = function(tabl, file) {
  return loadIDB(tabl, projectId(), file);
}

var updateIDB = function(tabl, project, file, field, contents) {
  return new Promise(function(resolve, reject) {
    var key;
    if (contents === undefined) {
      contents = field;
      field = file;
      file = undefined;
      key = project;
    } else {
      key = project + "." + file;
    }
    var trans = db.transaction([tabl], "readwrite");
    var table = trans.objectStore(tabl);
    var req = table.get(key)
    req.onerror = function(error) {
      logError(null, error);
      if (reject)
        reject();
    };
    req.onsuccess = function(e) {
      //console.log("Updating", field, "->", contents, "on", req.result, "from", key, "on", tabl);
      var newvalue;
      if (field == null)
        newvalue = contents;
      else {
        req.result[field] = contents;
        newvalue = req.result;
      }
      var putreq = table.put(newvalue, key);
      putreq.onsuccess = function() {
        resolve();
      };
      putreq.onerror = function(error) {
        logError(null, error);
        if (reject)
          reject();
      }
    };
  });
}

var updateIDBc = function(tabl, file, field, contents) {
  return updateIDB(tabl, projectId(), file, field, contents);
}

// TODO: pass in transaction for batch updates.
var putIDB = function(tabl, project, file, contents) {
  return new Promise(function(resolve, reject) {
    var key;
    if (contents) {
      key = project + "." + file;
    } else {
      key = project;
      contents = file;
    }

    var trans = db.transaction([tabl], "readwrite");
    var table = trans.objectStore(tabl);
    var req = table.put(contents, key);
    req.onerror = function(error) {
      logError(null, error);
      if (reject)
        reject();
    };
    req.onsuccess = function(e) {
      resolve();
    };
  });
}

var putIDBc = function(tabl, file, contents) {
  return putIDB(tabl, projectId(), file, contents);
}

var rmIDB = function(tabl, project, file) {
  return new Promise(function(resolve, reject) {
    var key;
    if (file) {
      key = project + "." + file;
    } else {
      key = project;
    }

    var trans = db.transaction([tabl], "readwrite");
    var table = trans.objectStore(tabl);
    var req = table.delete(key);
    req.onerror = function(error) {
      logError(null, error);
      if (reject)
        reject();
    };
    req.onsuccess = function(e) {
      resolve();
    };
  });
}

var rmIDBc = function(tabl, file) {
  return putIDB(tabl, projectId(), file);
}

var lastedittime = 0;
var edits = [["m", 0, 0, 0]];
var currenthistory = -1;
var currenthistoryfile = -1;
var currenthistorytime = -1;

var padtime = function(n) {
  if (n < 10)
    return "0" + n;
  return n;
}

var displayeditstate = function() {
  var disp = document.getElementById("historystate");
  var histdatediv = document.getElementById("historydate");
  var cur = currenthistory == -1 ? edits.length - 1: currenthistory;
  if (!edits) {
    disp.innerText = "";
    histdatediv.classList.add("hidden");
  }
  disp.innerText = cur + "/" + (edits.length - 1);

  if (currenthistory == -1)
    histdatediv.classList.add("hidden");
  else {
    histdatediv.classList.remove("hidden");
    var histdate = new Date(currenthistorytime);
    histdatediv.innerText = (histdate.getMonth() + 1) + "/" + padtime(histdate.getDate()) + " " + padtime(histdate.getHours()) + ":" + padtime(histdate.getMinutes()) + ":" + padtime(histdate.getSeconds());
  }
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
//   *[P]age load (userid, sessionid, historyid)
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
  //console.log(type, now - lastedittime, row, col, data, "/", edits.length);
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
  saveToServerIfDirty();
  autosavestate.forcetime = null;
  autosavestate.timer = null;
}

var triggerautosave = function() {
  if (currenthistory != -1)
    return;
  if (autosavestate.timer) {
    clearTimeout(autosavestate.timer);
    autosavestate.timer = setTimeout(autosave, Math.min(5000, autosavestate.forcetime - Date.now()));
  } else {
    autosavestate.forcetime = Date.now() + 30000;
    autosavestate.timer = setTimeout(autosave, 5000);
  }
}

var editorupdate = function(delta) {
  if (currenthistory != -1)
    return;
  var action = delta.action[0];
  var text = delta.lines.join("\n");
  var type = delta.action[0] == "r" ? "d" : delta.action[0];
  logedit(type, delta.start, text);
  triggerautosave();
}

var saveFile = function() {
  // Don't save inherited files
  var fileid = document.querySelector(".filename.open").getAttribute("fileid");
  return loadIDBc("files", fileid).then(function(file) {
    var attrs = file.attrs;
    if (attrs && (attrs.indexOf("i") != -1 || attrs.indexOf("r") != -1))
      return;
    // Only save at end of history.  Eventually history should be saving, but until then...
    if (currenthistory != -1)
      return;
    return updateIDBc("files", fileid, "contents", editor.getValue());
  }).then(function() {
    return updateIDBc("history", "all", null, serializeEdits());
  });
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

var setCurrentHistoryFile = function(start) {
  for (var i = start; i >= 0; i--) {
    if (edits[i][0] == "l") {
      currenthistoryfile = edits[i][4][1];
      //console.log(edits[i]);
      break;
    }
    if (edits[i][0] == "r") {
      var filelist = document.getElementById("filelist");
      currenthistoryfile = parseInt(filelist.children[0].getAttribute("fileid"));
      break;
    }
    if (edits[i][0] == "a") {
      currenthistoryfile = edits[i][4][1];
      break;
    }
  }
}

var getAbsoluteHistoryTime = function() {
  var offset = 0;
  for (var i = currenthistory; i > 0; i--) {
    // Any absolute time will be bigger than 1B seconds.
    if (edits[i][1] > 1000000000000)
      return edits[i][1] + offset;
    offset += edits[i][1];
  }
}

var historymove_timer;
var historymove = function(adjust, delay) {
  if (!edits || edits.length == 0)
    return;
  var histlen = edits.length;
  if (currenthistory == -1 && adjust > 0 || currenthistory == 0 && adjust < 0)
    return;
  if (currenthistory == -1) {
    currenthistoryfile = 0;
    saveFile(); // TODO: this is a promise
    currenthistory = edits.length - 1;
    setCurrentHistoryFile(currenthistory);
    editor.setOption("behavioursEnabled", false);
    editor.setOption("enableAutoIndent", false);
  }
  if (adjust > 0)
    currenthistory += adjust;
  editor.setReadOnly(true);

  var edit = edits[currenthistory];
  //console.log("currenthistoryfile was", currenthistoryfile);
  //console.log("edit is", edit);
  // Load up the currently active file.  Unless it was removed.
  if (edit[0] != "r")
    loadFile(currenthistoryfile, true);
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
      loadFile(edit[4][1], true);
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
      setCurrentHistoryFile(currenthistory - 1);
      var prevfile = edit[4][0]
      if (/*i >= 0 && */prevfile != currenthistoryfile) {
        console.log("history load file mismatch on ", /*i, */";", prevfile, "vs", currenthistoryfile, "from"/*, edits[i]*/);
        prevfile = currenthistoryfile;
      }
      loadFile(prevfile, true);
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
      div.addEventListener("click", werr(loadFile));
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
  //console.log("currenthistoryfile is", currenthistoryfile);

  while (edits.length > histlen)
    edits.pop();
  if (adjust < 0)
    currenthistory += adjust;
  if (currenthistory >= edits.length - 1) {
    checkHistoryReplay();
    currenthistory = -1;
    editor.setReadOnly(false);
    editor.setOption("behavioursEnabled", true);
    editor.setOption("enableAutoIndent", true);
    displayeditstate();
    return;
  }
  currenthistorytime = getAbsoluteHistoryTime();

  displayeditstate();
  var newdelay = delay > 100 ? delay * 2 / 3 : delay > 10 ? delay * 0.95 : 10;
  historymove_timer = setTimeout(historymove, newdelay, adjust, newdelay);
}

var start_historymove = function(adjust) {
  historymove(adjust, 500);
}

var stop_historymove = function(adjust) {
  if (historymove_timer) {
    clearTimeout(historymove_timer);
    historymove_timer = null;
  }
}

var load_sibling = function() {
  var pid = document.getElementById("siblingsselect").value;
  loadIDBc("projects").then(function(projRow) {
    return updateIDB("projects", pid, "lastfile", projRow.lastfile);
  }).then(function() {
    document.location.href = "/projects/" + pid;
  });
}

var promptForSave = function(e) { e.preventDefault() }

var markDirty = function() {
  if (currenthistory != -1)
    return;
  document.getElementById("savefiles").classList.add("dirty");
  window.addEventListener("beforeunload", promptForSave);
  if (markdownvisible)
    rendermarkdown();
}

var renameFile = function(elem) {
  if (currenthistory != -1)
    return;
  if (elem.classList.contains("editing"))
    return
  loadIDBc("files", elem.getAttribute("fileid")).then(function(fileRow) {
    var attrs = fileRow.attrs
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
      var newname = editbox.value.trim();
      elem.removeChild(editbox);
      elem.classList.remove("editing");

      loadIDBc("projects").then(function(projRow) {
        var files = projRow.files;
        var fileid = elem.getAttribute("fileid")
        for (var i in files)
          if (files[i] == newname && fileid != i)
            newname = name;
        if (newname == "")
          newname = name;
        if (newname.length > 64)
          newname = name;

        elem.innerText = newname;
        elem.setAttribute("title", newname);

        if (newname == name)
          return;
        files[fileid] = newname;
        var promises = [
          updateIDBc("projects", "files", files),
          updateIDBc("files", fileid, "name", newname)
        ];
        return Promise.all(promises);
      }).then(function() {
        document.getElementById("savefiles").classList.add("dirty");
        return logedit("n", editor.session.selection.getCursor(), [elem.getAttribute("fileid"), name, newname]);
      });
    };
    editbox.addEventListener("blur", werr(finishEdit));
    editbox.addEventListener("beforeinput", werr(function(e) {
      if (e.inputType == "insertLineBreak")
        finishEdit();
    }));
  });
}

var fileContents = function(projectid, fileid) {
  return loadIDB("files", projectid, fileid).then(function(fileRow) {
    console.log("Loaded ", fileRow, "for", projectid, fileid);
    var attrs = fileRow.attrs;
    // TODO: This is handled serverside now.  Is that right?
    if (0 && attrs && attrs.indexOf("i") != -1) {
      console.log("Inherited");
      var par;
      var parfile;
      return loadIDB("projects", projectid).then(function(projRow) {
        console.log(projRow);
        par = projRow.parent;
        return loadIDB("files", projectid, fileid);
      }).then(function(pf) {
        parfile = pf;
        console.log("par is", par);
        return fileContents(par, parfile);
      }).then(function(parcontents) {
        if (parcontents)
          return parcontents;
        return parfile
      });
    } else {
      console.log("direct");
      return fileRow.contents;
    }
  });
}

var fileForRun = function(projectid, fileid, par) {
  return loadIDBc("files", fileid).then(function(fileRow) {
    var attrs = fileRow.attrs;
    if (attrs && attrs.indexOf("i") != -1) {
      return {"inherit": {"project": parseInt(par), "file": parseInt(fileid)}};
    } else {
      return {"contents": fileRow.contents}
    }
  });
}

var manualmarkdown = false;
var setOutputType = function(readonly) {
  var filenamediv = document.querySelector(".filename.open");
  var markdown = filenamediv.innerText.endsWith(".md");
  var leftmarkdown = readonly && markdown;
  var rightmarkdown = !readonly && markdown;
  markdownvisible = leftmarkdown ? "instructions" : rightmarkdown ? "markdownoutput" : null;

  if (leftmarkdown) {
    document.getElementById("code").classList.add("hidden")
    document.getElementById("instructionscontainer").classList.remove("hidden")
  } else {
    document.getElementById("code").classList.remove("hidden")
    document.getElementById("instructionscontainer").classList.add("hidden")
  }

  if (rightmarkdown || manualmarkdown) {
    document.getElementById("terminalcontainer").classList.add("hidden")
    document.getElementById("markdowncontainer").classList.remove("hidden")
    document.getElementById("toggleinstructions").innerText = "Show output";
    document.getElementById("rightlabel").innerText = "Instructions:";
    document.getElementById("clearterminal").classList.add("hidden");
    document.getElementById("runstatus").classList.add("hidden");
    rendermarkdown();
  } else {
    document.getElementById("terminalcontainer").classList.remove("hidden")
    document.getElementById("markdowncontainer").classList.add("hidden")
    document.getElementById("toggleinstructions").innerText = "Show instructions";
    document.getElementById("rightlabel").innerText = "Program output:";
    document.getElementById("clearterminal").classList.remove("hidden");
    document.getElementById("runstatus").classList.remove("hidden");
  }
  if (markdownvisible)
    rendermarkdown();
}

var toggleinstructions = function() {
  var markdowncontainer = document.getElementById("markdowncontainer");
  if (markdowncontainer.classList.contains("hidden")) {
    document.getElementById("terminalcontainer").classList.add("hidden")
    document.getElementById("markdowncontainer").classList.remove("hidden")
    document.getElementById("toggleinstructions").innerText = "Show output";
    document.getElementById("rightlabel").innerText = "Instructions:";
    document.getElementById("clearterminal").classList.add("hidden");
    document.getElementById("runstatus").classList.add("hidden");
    manualmarkdown = true;
    renderinstructions();
  } else {
    document.getElementById("terminalcontainer").classList.remove("hidden")
    document.getElementById("markdowncontainer").classList.add("hidden")
    document.getElementById("toggleinstructions").innerText = "Show instructions";
    document.getElementById("rightlabel").innerText = "Program output:";
    document.getElementById("clearterminal").classList.remove("hidden");
    document.getElementById("runstatus").classList.remove("hidden");
    manualmarkdown = false;
  }
}

var setEditorLanguage = function(sess, filename) {
  if (!filename)
    filename = document.querySelector(".filename.open").innerText;
  if (filename.endsWith(".md"))
    sess.setMode("ace/mode/markdown");
  else
    sess.setMode("ace/mode/java");
}

var loadFile = function(fileid, contents, savehistoryfile) {
  var filenamediv;
  if (contents == true) {
    contents = null;
    savehistoryfile = true
  }
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
  updateIDBc("projects", "lastfile", parseInt(fileid)).then(function() {
    var sess = sessions[fileid]
    if (!sess) {
      if (contents)
        return ace.createEditSession(contents);
      else
        return fileContents(projectId(), fileid).then(function(contents) {
          return ace.createEditSession(contents || "");
        });
    }
    return sess;
  }).then(function(sess) {
    setEditorLanguage(sess, filenamediv.innerText);
    sess.setUseWrapMode(true);
    sess.setOption("indentedSoftWrap", false);
    sess.on("change", editorupdate);
    sess.on("changeSelection", cursorupdate);
    sessions[fileid] = sess;
    if (!savehistoryfile)
      logedit("l", sess.selection.getCursor(), [parseInt(oldfileid), parseInt(fileid)]);
    editor.setSession(sess);
    displayeditstate();
    filenamediv.classList.add("open");
    if (currenthistory != -1 && savehistoryfile == true)
      currenthistoryfile = parseInt(fileid);
    // TODO: async issues?
    loadIDBc("files", fileid).then(function(fileRow) {
      if (currenthistory == -1) {
        var attrs = fileRow.attrs;
        if (attrs && (attrs.indexOf("r") != -1 || attrs.indexOf("i") != -1))
          editor.setReadOnly(true);
        else
          editor.setReadOnly(false);
      }
      setOutputType(attrs && attrs.indexOf("r") != -1);
    });
  });
}

var addFile = function() {
  var nextId = 0;
  var newfile;
  var oldfileid = document.querySelector(".filename.open").getAttribute("fileid");
  loadIDBc("projects").then(function(projRow) {
    var filenames = projRow.files;
    var promises = [];
    var max = -1;
    for (var f in filenames) {
      if (parseInt(f) >= nextId)
        nextId = parseInt(f) + 1;
      if (filenames[f] == "untitled")
        max = 0;
      else if (filenames[f].slice(0, 8) == "untitled")
        max = Math.max(max, parseInt(filenames[f].slice(8)));
    }
    newfile = max == -1 ? "untitled" : "untitled" + (max + 1);
    filenames[nextId] = newfile;
    promises.push(updateIDBc("projects", "files", filenames));
    promises.push(putIDBc("files", nextId, {name: newfile, contents: ""}))
    return Promise.all(promises);
  }).then(function() {
    // TODO: dedup this with initFiles
    var filelist = document.getElementById("filelist");
    var div = document.createElement("div");
    div.innerText = newfile;
    div.setAttribute("title", newfile);
    div.classList.add("filename");
    div.setAttribute("fileid", nextId);
    filelist.appendChild(div);

    // TODO: dedup with loadFile
    document.querySelector(".filename.open").classList.remove("open");
    updateIDBc("projects", "lastfile", nextId);
    div.classList.add("open");

    var sess = ace.createEditSession("");
    setEditorLanguage(sess);
    sess.setUseWrapMode(true);
    sess.setOption("indentedSoftWrap", false);
    sess.on("change", editorupdate);
    sess.on("changeSelection", cursorupdate);
    sessions[nextId] = sess;
    editor.setSession(sess);

    logedit("a", sess.selection.getCursor(), [parseInt(oldfileid), nextId, newfile]);

    div.addEventListener("click", werr(loadFile));
  });
}

var uploadFile = function(e) {
  // TODO: dedupe with addFile
  var file = e.target.files[0];
  var newfile;
  var nextId;
  const reader = new FileReader();
  reader.addEventListener("load", function(e) {
    console.log(file.name, file.type, e.target.result);

    loadIDBc("projects").then(function(projRow) {
      var filenames = projRow.files;
      var max = -1;
      nextId = 0;
      var oldfileid = document.querySelector(".filename.open").getAttribute("fileid");
      for (var f in filenames) {
        if (parseInt(f) >= nextId)
          nextId = parseInt(f) + 1;
        if (filenames[f] == file.name)
          max = 0;
        else if (filenames[f].slice(0, file.name.length) == file.name.length)
          max = Math.max(max, parseInt(filenames[f].slice(file.name.length)));
      }
      newfile = max == -1 ? file.name : file.name + (max + 1);
      filenames[nextId] = newfile;
      var promises = [
        updateIDBc("projects", "files", filenames),
        putIDBc("files", nextId, {
          "name": newfile,
          "contents": e.target.result
        })
      ];
      return Promise.all(promises);
    }).then(function() {
      // TODO: dedup this with initFiles
      var filelist = document.getElementById("filelist");
      var div = document.createElement("div");
      div.innerText = newfile;
      div.setAttribute("title", newfile);
      div.classList.add("filename");
      div.setAttribute("fileid", nextId);
      filelist.appendChild(div);

      // TODO: open file if appropriate

      // TODO: logedit as upload including contents instead of add
      //logedit("a", sess.selection.getCursor(), [parseInt(oldfileid), nextId, newfile]);

      div.addEventListener("click", werr(loadFile));
    });
  });
  reader.readAsBinaryString(file);
}

var removeFile = function() {
  var div = document.querySelector(".filename.open");
  var fileid = parseInt(div.getAttribute("fileid"));
  var filename = div.innerText;
  var filerow;

  return loadIDBc("files", fileid).then(function(fr) {
    fileRow = fr;
    var attrs = fileRow.attrs;
    if (attrs && (attrs.indexOf("r") != -1 || attrs.indexOf("i") != -1))
      return;

    if (!confirm("Are you sure you want to delete " + filename + "?"))
      return;

    return loadIDBc("projects");
  }).then(function(projRow) {
    var filelist = document.getElementById("filelist");
    // TODO: handle deleting first file.
    loadFile.call(filelist.children[0]);
    filelist.removeChild(div);

    var files = projRow.files;
    delete files[fileid];
    var promises = [
      rmIDBc("files", fileid),
      updateIDBc("projects", "files", files)
    ];
    logedit("r", editor.session.selection.getCursor(), [fileid, filename, fileRow.contents]);
    return Promise.all(promises)
  });

}

var saveToServer = function() {
  var projRow;
  var fileids = [];
  var savebutton = document.getElementById("savefiles");
  var loadbutton = document.getElementById("loadfiles");
  saveFile().then(function() {
    savebutton.innerText = "Saving..."
    return loadIDBc("projects");
  }).then(function(pr) {
    projRow = pr;
    var promises = [loadIDBc("history")];
    for (var i in pr.files) {
      console.log("Loading", i);
      promises.push(loadIDBc("files", i));
      fileids.push(i);
    }
    return Promise.all(promises);
  }).then(function(files) {
    var postdata = {};
    if (projRow.parent)
      postdata["parent"] = projRow.parent;
    postdata["history"] = files.shift();
    postdata["files"] = {};
    for (var i in files) {
      console.log(i, files);
      postdata.files[fileids[i]] = {
        "name": files[i].name,
        "contents": files[i].contents,
        "attrs": files[i].attrs || ""
      };
    }

    console.log(postdata);
    var xhr = new XMLHttpRequest();
    xhr.open("POST", baseURL() + "save", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onprogress = function() {
      if (xhr.readyState === XMLHttpRequest.DONE || xhr.readyState === XMLHttpRequest.LOADING) {
        if(xhr.status != 200) {
          savebutton.innerText = "Error talking to server";
          var postdata =  {
            "project": projectId(),
            "error": "Error saving file to server",
            "stacktrace": null,
            "data":  {
              "status": xhr.status,
              "body": xhr.response
            }
          };
          sendError(postdata);
        } else {
          savebutton.innerText = "save";
          document.getElementById("savefiles").classList.remove("dirty");
          window.removeEventListener("beforeunload", promptForSave);
          loadbutton.classList.remove("stale");
          loadbutton.removeAttribute("title");
        }
      }
    };
    xhr.send(JSON.stringify(postdata));
  });
}

var saveToServerIfDirty = function() {
  if (document.getElementById("savefiles").classList.contains("dirty") &&
     !document.getElementById("loadfiles").classList.contains("stale"))
    saveToServer();
}

var pagehidden = function() {
  if (document.visibilityState == "hidden")
    saveToServerIfDirty();
}
var loadFromServer = function(pid) {
  console.log("Loading from server");
  if (currenthistory != -1) {
    alert("Cannot load from server while viewing history");
    return
  }
  if (pid === undefined)
    pid = projectId();
  var loadbutton = document.getElementById("loadfiles");
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/projects/" + pid + "/load", true);
  xhr.onerror = function() {
    loadbutton.textContent = "Error talking to server";
  }
  var files;
  xhr.onload = function() {
    console.log("In XHR onload for loading from server")
    var serverResponse = JSON.parse(xhr.response);
    var serverFiles = serverResponse.files || {}
    if (Object.keys(serverFiles).length == 0) {
      // this is a bit hacky, but makes some sense.  If there's no server save
      // or local save, bootstrap it.
      return loadIDBc("files").then(function(f) {
        files = f;
        if (!files) {
          bootstrapStorage();
          initFiles().then(saveToServer);
        }
        else
          loadbutton.innerText = "no server save";
        document.getElementById("savefiles").classList.remove("dirty");
        window.removeEventListener("beforeunload", promptForSave);
      });
    }

    // TODO: dedupe with reset
    loadIDB("projects", pid).then(function(projRow) {
      if (projRow && projRow.files) {
        var promises = []
        for (var i in files)
          promises.push(rmIDB("files", pid, i));
        return Promise.all(filePromises);
      } else {
        return putIDBc("projects", {lastfile: 0});
      }
    }).then(function() {
      if (pid == projectId()) {
        console.log("Removing file list");
        var filelist = document.getElementById("filelist");
        while (filelist.firstChild)
          filelist.removeChild(filelist.lastChild);
        sessions = [];
      }

      if (serverResponse.history)
        return updateIDBc("history", "all", null, serverResponse.history);
      else
        return Promise.resolve();
    }).then(function() {
      var promises = []
      filenames = {};
      console.log(serverFiles);
      for (var i in serverFiles) {
        putIDBc("files", i, {"name": serverFiles[i].name, "contents": serverFiles[i].contents});
        if (serverFiles[i].attrs)
          promises.push(updateIDBc("files", i, "attrs", serverFiles[i].attrs));
        filenames[i] = serverFiles[i].name;
      }
      promises.push(updateIDBc("projects", "files", filenames));
      if (serverResponse.parent) {
        promises.push(updateIDBc("projects", "parent", serverResponse.parent));
      }
      return Promise.all(promises);
    }).then(function() {
      if (pid == projectId()) {
        initFiles();
        loadbutton.innerText = "load";
        loadbutton.classList.remove("stale");
        loadbutton.removeAttribute("title");
        document.getElementById("savefiles").classList.remove("dirty");
        window.removeEventListener("beforeunload", promptForSave);
      }
    });
  };
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
  var filenames;
  var runbutton = document.getElementById(test ? "runtests" : "run");
  var otherrunbutton = document.getElementById(!test ? "runtests" : "run");
  saveFile().then(function() {
    runbutton.innerText = test ? "stop running tests..." : "stop running...";
    otherrunbutton.setAttribute("disabled", "");
    return loadIDBc("projects");
  }).then(function(projRow) {
    filenames = projRow.files;
    var promises = []
    for (var i in filenames)
      promises.push(fileForRun(projectId(), i, projRow.parent));
    return Promise.all(promises);
  }).then(function(fileContents) {
    var body = {};
    var i = 0;
    for (var f in filenames)
      body[filenames[f]] = fileContents[i++];

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
  });
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

var showcomment = function() {
  document.getElementById("commentbox").classList.remove("hidden");
}

var showerrors = function() {
  document.getElementById("errorbox").classList.remove("hidden");
}
var hideerrors = function() {
  document.getElementById("errorbox").classList.add("hidden");
}

var hidecomment = function() {
  document.getElementById("commentbox").classList.add("hidden");
}

var submitcomment = function() {
  var entry = document.getElementById("commentbody");
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/comments", true);
  xhr.setRequestHeader("Content-Type", "application/json");
  var data = JSON.stringify({"content": entry.value});
  xhr.send(data);
  entry.value = "";
  document.getElementById("commentbox").classList.add("hidden")
}

var sendinputfromterminal = (function() {
  var buffer = "";
  return function(content) {
    if (content == "\r") {
      websocket.send(JSON.stringify({"input": buffer + "\n"}));
      buffer = "";
    } else if (content == "\x7f") {
      buffer = buffer.slice(0, buffer.length - 1);
    } else {
      buffer += content;
    }
  };
})();

var renderinstructions = function() {
  loadIDBc("projects").then(function(projRow) {
    var files = projRow.files;
    var id = null;
    for (var i in files)
      if (files[i] == "instructions.md") {
        id = i;
        break;
      }

    if (!id) {
      document.getElementById("markdownoutput").innerHTML = "no instructions found";
      return;
    }

    return loadIDBc("files", i);
  }).then(function(fileRow) {
    var rendered = DOMPurify.sanitize(marked.parse(fileRow.contents));
    document.getElementById("markdownoutput").innerHTML = rendered;
  });
}

var rendermarkdown = (function() {
  var timer;
  var lastrender = 0;
  return function() {
    if (!markdownvisible)
      return;
    if (timer)
      return;
    var render = function() {
      var rendered = DOMPurify.sanitize(marked.parse(editor.getValue()));
      // This can break on history :(
      var elem = document.getElementById(markdownvisible);
      if (elem)
        elem.innerHTML = rendered;
      else
        console.log("Missing markdown elem:", markdownvisible);
      timer = null;
    }
    var now = Date.now();
    if (now - lastrender > 300) {
      render();
      lastrender = now;
    } else {
      timer = setTimeout(render, 300);
    }
  }
})();


var bootstrapStorage = function() {
    localStorage.setItem("version", 0);
    saveLSc("files", JSON.stringify(["instructions.md", "Main.java", "Num.java", "TestNum.java", "template/Num.java"]));
    localStorage.setItem("lastfile|" + projectId(), "instructions.md");
    localStorage.setItem(localFileStore("instructions.md"), `# Numbers

This is a sample project to get you started.  This file is written in markdown, a simple formatting language.  You can do **bold**, _italic_, and other simple formatting.

This document (or any other file ending in .md) will be shown to the students only in rendered form (visible to the right).

Any files starting in Test, ending in Test.java or Tests.java, or in a tests/ directory will be hidden from the students and run as tests.

Any files in the template/ directory will be copied to the top-level, overwriting any files in this project.

And finally, any other files will be read-only for thet students.

For example, in this sample project, Main.java will be provided to the students as read-only, while Num.java will be overwritten by template/Num.java and the students will be able to edit it.  They will not be able to see TestNum.java, but the "run tests" button will run the tests in that file.  This file will be visible to the students, but only rendered, not as the underlying markdown.

### Instructions

Add a single method \`add\` to the \`Num\` class that takes two integers as arguments and returns their sum.

### Sample input/output

\`add(5, 8)\`should return 13
`);
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
  localStorage.setItem(localFileStore("template/Num.java"), `public class Num {
  // fill in your code here
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

// TODO: dudupe with loadFromServer
var checkLocalStale = function() {
  pid = projectId();
  var loadbutton = document.getElementById("loadfiles");
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/projects/" + pid + "/load", true);
  xhr.onerror = function() {
    console.log("Error talking to server to check staleness");
  }
  xhr.onload = function() {
    var serverResponse = JSON.parse(xhr.response);
    var serverHistory = serverResponse.history || {}
    if (!history)
      return;

    loadIDB("history", pid, "all").then(function(localHistory) {
      if ((serverHistory && !localHistory) || (serverHistory && (serverHistory.length > localHistory.length))) {
        loadbutton.classList.add("stale");
        loadbutton.setAttribute("title", "newer version detected on server");
      }
    });
  }
  xhr.send();

  return
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
  saveLS("files", to, JSON.stringify(newfiles));
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
      if (files[f].endsWith(".md")) {
        saveLS("files", to, f, f);
        attrs = attrs.concat("i");
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
  if (!name)
    return;

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
  var compare50 = document.getElementById("compare50");
  var viewsubmissions = document.getElementById("viewsubmissions");
  if (this.hasAttribute("published")) {
    var xhr = new XMLHttpRequest();
    xhr.open("DELETE", "/projects/" + projectId() + "/tags/1", true);
    xhr.onload = function() {
      publish_button.disabled = false;
      publish_button.innerText = "publish project";
      publish_button.removeAttribute("published");
      if (compare50)
        compare50.classList.add("hidden");
      if (viewsubmissions)
        viewsubmissions.classList.add("hidden");
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
      if (compare50)
        compare50.classList.remove("hidden");
      if (viewsubmissions)
        viewsubmissions.classList.remove("hidden");
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
    xhr.open("POST", "/projects/" + projectId() + "/actions/2", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = function() {
      submit_button.disabled = false;
      submit_button.innerText = "submit project";
      submit_button.removeAttribute("submitted");
      document.getElementById("submittedbool").classList.add("hidden");
      document.getElementById("submittedtime").classList.add("hidden");
    };
    this.innerText = "unsubmitting..."
    this.disabled = true;
    xhr.send("{}");
  } else {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/projects/" + projectId() + "/actions/1", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = function() {
      submit_button.disabled = false;
      submit_button.innerText = "unsubmit project";
      submit_button.setAttribute("submitted", "");
      document.getElementById("submittedbool").classList.remove("hidden");
      document.getElementById("submittedtime").classList.remove("hidden");
      document.getElementById("submittedtime").innerText = formattime(new Date());
    };
    this.innerText = "submitting..."
    this.disabled = true;
    xhr.send("{}");
  }
}

var compare50 = function() {
  document.location.href = document.location + "/compare"
}

var viewsubmissions = function() {
  document.location.href = document.location + "/submissions"
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
        updateIDBc("projects", "lastfile", i);
    }
  }

  if (version < 2) {
    var trans = db.transaction(["projects", "files", "history"], "readwrite");
    var dbfiles = trans.objectStore("files");
    var dbprojects = trans.objectStore("projects");
    var dbhistory = trans.objectStore("history");
    var keys = Object.keys(localStorage)
    for (var k in keys) {
      var key = keys[k];
      if (key.startsWith("files|")) {
        //console.log(key);
        var projectidstr = key.substr(6);
        if (projectidstr.indexOf("|") != -1)
          continue;
        var projectid = parseInt(projectidstr);

        var filenames = JSON.parse(localStorage.getItem(key));
        for (var fileid in filenames) {
          var filename = filenames[fileid]
          //console.log(projectid, key, fileid, filename, attrs);
          var fileObj = {
            "name": filename,
            "contents": localStorage.getItem("files|" + projectid + "|" + fileid)
          }
          var attrs = localStorage.getItem("attrs|" + projectid + "|" + fileid);
          if (attrs)
            fileObj.attrs = attrs;
          dbfiles.put(fileObj, projectid + "." + fileid);
        }

        var projectRow = {
          "files": filenames
        }
        var lastfile = localStorage.getItem("lastfile|" + projectid);
        if (lastfile !== null)
          projectRow.lastfile = parseInt(lastfile);
        var prnt = localStorage.getItem("parent|" + projectid);
        if (prnt)
          projectRow.parent = parseInt(prnt);
        dbprojects.put(projectRow, projectid);

        var edits = localStorage.getItem("edits|" + projectid);
        if (edits)
          dbhistory.put(edits, projectid + ".all");
      }
    }
  }


  localStorage.setItem("version", 2);
}

var initFiles = function() {
  var lastfile;
  var lastfileIndex;
  var filenames;
  var filelist = document.getElementById("filelist");

  var projRow;
  var fileIndices = {};
  var files;
  var opened = false;

  loadIDBc("projects").then(function(pr) {
    projRow = pr;
    filenames = projRow.files;
    console.log("row is ", projRow, "From", projectId());
    filePromises = [];
    var i = 0;
    for (f in projRow["files"]) {
      filePromises.push(loadIDBc("files", f));
      fileIndices[parseInt(f)] = i++;
    }
    return Promise.all(filePromises);
  }).then(function(f) {
    files = f;

    var index = 0;
    for(f in projRow.files) {
      var fileInfo = files[index];
      var attrs = fileInfo.attrs;
      if (attrs && attrs.indexOf("h") != -1)
        continue;
      var div = document.createElement("div");
      div.innerText = fileInfo.name;
      div.setAttribute("title", fileInfo.name);
      div.classList.add("filename");
      div.setAttribute("fileid", f);
      if (f == projRow.lastfile) {
        div.classList.add("open");
        opened = true;
        lastfile = projRow.lastfile;
      }
      if (attrs && (attrs.indexOf("r") != -1 || attrs.indexOf("i") != -1))
        div.classList.add("readonly");
      filelist.appendChild(div);
      index++;
    }

    return loadIDB("history", projectId(), "all");
  }).then(function(e) {
    edits = e;
    if (edits)
      edits = deserializeEdits(edits);
    else
      edits = [["m", 0, 0, 0]];
    displayeditstate();

    if (!opened && filelist.children.length > 0) {
      currenthistoryfile = -1;
      setCurrentHistoryFile(edits.length - 1);
      console.log("Found history file", currenthistoryfile, "from", edits);
      if (currenthistoryfile != -1)
        lastfile = currenthistoryfile;
      else
        lastfile = document.getElementById("filelist").childNodes[0].getAttribute("fileid");
      document.querySelector('#filelist .filename[fileid="' + lastfile + '"]').classList.add("open");
    }

    return updateIDBc("projects", "lastfile", parseInt(lastfile));
  }).then(function() {
    var activefile = files[fileIndices[parseInt(lastfile)]];
    logedit("l", editor.session.selection.getCursor(), [-1, parseInt(lastfile)]);
    // Above this is IDB

    var sess = ace.createEditSession(activefile.contents);
    setEditorLanguage(sess);
    sess.setUseWrapMode(true);
    sess.setOption("indentedSoftWrap", false);
    sess.on("change", editorupdate);
    sess.on("changeSelection", cursorupdate);
    editor.setSession(sess);
    sessions[lastfile] = sess;
    var attrs = activefile.attrs;
    if (attrs && (attrs.indexOf("r") != -1 || attrs.indexOf("i") != -1))
      editor.setReadOnly(true);
    else
      editor.setReadOnly(false);

    filenames = document.getElementsByClassName("filename");
    for (var i = 0; i < filenames.length; i++)
      filenames[i].addEventListener("click", werr(loadFile));
    setOutputType(attrs && attrs.indexOf("r") != -1);
  });
}

var toggleDarkMode = function () {
  var body = document.getElementsByTagName("body")[0];
  if (body.getAttribute("theme") == "dark") {
    document.getElementById("switchtheme").innerText = "dark mode";
    localStorage.removeItem("theme");
    body.removeAttribute("theme");
    editor.setTheme("ace/theme/textmate");
    term.options.theme = {
      foreground: "black",
      background: "white",
      cursor: "gray",
      selectionBackground: "lightgray"
    };
  } else {
    document.getElementById("switchtheme").innerText = "light mode";
    localStorage.setItem("theme", "dark");
    body.setAttribute("theme", "dark");
    editor.setTheme("ace/theme/twilight");
    term.options.theme = {
      foreground: "white",
      background: "black",
      cursor: "gray",
      selectionBackground: "#444444"
    };
  }
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
      term.resize(term.cols, 10)
      for (var i = 0; i < 50; i++)
        term.fit.fit();
      resizeTimer = null;
    }, 50);
  });
}

var initDarkMode = function() {
  if (localStorage.getItem("theme") == "dark")
    toggleDarkMode();
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
    elem.addEventListener("click", werr(f));
}

var addListenerById = function(id, e, f) {
  var elem = document.getElementById(id);
  if (elem)
    elem.addEventListener(e, werr(f));
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

var pad = function(n) {
  if (n == 0)
    return "00";
  if (n < 10)
    return "0" + n;
  return n
}

var formattime = function(d) {
  return pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

var displaytimestamps = function() {
  var timestamps = document.getElementsByClassName("timestamp");
  for (var i = 0; i < timestamps.length; i++) {
    var text = timestamps[i].innerText;
    if (text == "None")
      timestamps[i].innerText = "unknown time";
    else {
      var d = new Date(parseInt(text) * 1000);
      timestamps[i].innerText = formattime(d);
    }
  }
}

var sendError = function(postdata) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/internal/logerror", true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.send(JSON.stringify(postdata));
}

var logError = function(ths, error) {
  console.log(error);
  document.getElementById("errorbutton").classList.remove("hidden");
  document.getElementById("errorcontents").innerHTML += error + "<br>";
  var data = {};
  if (ths && ths.id)
    data.elementid = ths.id;
  try {
    var fileid = document.querySelector(".filename.open").getAttribute("fileid");
    data.openfile = fileid;
  } catch (error) {}

  var postdata =  {
    "project": projectId(),
    "error": error.message,
    "stacktrace": error.stack,
    "data": data
  }
  sendError(postdata);
}

var werr = function(f) {
  return function(arg) {
    try {
      f.call(this, arg)
    } catch(error) {
      logError(this, error);
    }
  }
}

var wrapMessage = function(msg) {
  return {message: msg, toString: function() { return msg; }, stack: Error().stack};
}

var initIndexedDB = function() {
  return new Promise(function(resolve, reject) {
    var request = window.indexedDB.open("idecl", 4);
    request.onerror = function(e) {
      logError(null, wrapMessage("Error opening indexedDB: " + e));
      reject(e);
    };
    request.onupgradeneeded = function(e) {
      db = e.target.result;
      var version = e.oldVersion;

      if (version < 2)
        db.createObjectStore("files");
      if (version < 3)
        db.createObjectStore("projects");
      if (version < 4)
        db.createObjectStore("history");
    }
    request.onsuccess = werr(function(e) {
      db = e.target.result;
      db.onerror = function(e) {
        logError(null, wrapMessage("Error in IndexedDB: " + (e.target.error && e.target.error.message)));
      }
      console.log("Opened", db);
      upgradestore();
      resolve();
    })
  })
}

var setupMarked = function() {
  // TODO: update when files are added/renamed.
  return loadIDBc("projects").then(function(projRow) {
    var filelist = projRow.files;
    var promises = []
    for (var i in filelist)
      if (filelist[i].endsWith(".png") || filelist[i].endsWith(".jpg") || filelist[i].endsWith(".jpeg") || filelist[i].endsWith(".gif"))
        promises.push(loadIDBc("files", i));
    return Promise.all(promises);
  }).then(function(imageContents) {
    var images = {};
    for (var i in imageContents)
      images[imageContents[i].name] = imageContents[i].contents;
    marked.use({ walkTokens: function(token) {
      if (token.type == "image" && images[token.href]) {
        console.log("substituting tree", token, images);
        var contents = images[token.href];
        console.log("contents", contents);
        var filetype = null;
        if (token.href.endsWith(".png"))
          filetype = "png";
        else if (token.href.endsWith(".jpg") || token.href.endsWith(".jpeg"))
          filetype = "jpg";
        else if (token.href.endsWith(".gif"))
          filetype = "gif";

        if (filetype) {
          console.log("subst")
          token.href = "data:image/" + filetype + ";base64," + btoa(contents);
        } else
          console.log("Unknown type for file", token.href);
      }
    }});
  });
}

window.onload = function() {
  try {
    initIndexedDB().then(function() {
      loadIDBc("projects").then(function(projRow) {
        if (!projRow)
          loadFromServer(projectId());
        else {
          initFiles();
        }
      });
      setupMarked();
    });
    initAce();
    initTerminal();
    initDarkMode();
    displaytimestamps();
    //upgradestore();
    checkLocalStale();
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
    addClickListenerById("publish", publish);
    addClickListenerById("submit", submit);
    addClickListenerById("compare50", compare50);
    addClickListenerById("viewsubmissions", viewsubmissions);
    addClickListenerById("addfile", addFile);
    addListenerById("uploadfileinput", "change", uploadFile);
    addClickListenerById("removefile", removeFile);
    addClickListenerById("savefiles", saveToServer);
    document.addEventListener("visibilitychange", werr(pagehidden));
    addClickListenerById("loadfiles", function() { loadFromServer() });
    addClickListenerById("resetfiles", resetFiles);
    addListenerById("historyback", "mousedown", function() { start_historymove(-1); });
    addListenerById("historyback", "mouseup", stop_historymove);
    addListenerById("historyback", "mouseleave", stop_historymove);
    addListenerById("historyforward", "mousedown", function() { start_historymove(1); });
    addListenerById("historyforward", "mouseup", stop_historymove);
    addListenerById("historyforward", "mouseleave", stop_historymove);
    addListenerById("siblingsselect", "change", load_sibling);
    addClickListenerById("errorbutton", showerrors);
    addClickListenerById("closeerror", hideerrors);
    addClickListenerById("comments", showcomment);
    addClickListenerById("submitcomment", submitcomment);
    addClickListenerById("cancelcomment", hidecomment);
    addClickListenerById("switchlayout", switchlayout);
    addClickListenerById("switchtheme", toggleDarkMode);
    addClickListenerById("clearterminal", function() { term.write("\x1b[2J\x1b[3J\x1b[H"); });
    addClickListenerById("toggleinstructions", toggleinstructions);
  } catch (error) {
    logError(null, error);
  }
}
