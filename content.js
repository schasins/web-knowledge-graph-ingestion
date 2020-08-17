(function ContentScript(){
  'use strict'

  var popup_open = false;
  var popup_obj = null;
  var debug_mode = true;
  var clicked_nodes = [];

  function arrayOfTextsToTableRow(array){
    var $tr = $("<tr></tr>");
    for (var j= 0; j< array.length; j++){
      var $td = $("<td></td>");
      $td.html(_.escape(array[j]).replace(/\n/g,"<br>"));
      $tr.append($td);
    }
    return $tr;
  };

  function arrayOfArraysToTable(arrayOfArrays){
    var $table = $("<table></table>");
    for (var i = 0; i< arrayOfArrays.length; i++){
      var array = arrayOfArrays[i];
      var $tr = arrayOfTextsToTableRow(array);
      $table.append($tr);
    }
    return $table;
  };

  function highlightColumns(tableElement, columnsToHighlight){

    // some functions we'll need soon
    var clickOnHighlighted = function _clickOnHighlighted(event){
        console.log("clicked on highlighted");
        var rowElem = $(event.target).closest('tr');
        var tds = rowElem.find('td');
        var index = $.inArray(event.target, tds);
        console.log("index", index);
        columnsToUse = _.without(columnsToUse, index);
        highlightColumns(tableElement, columnsToUse);
        processFirstTable(currTable);
    };
    var clickOnUnhighlighted = function _clickOnUnhighlighted(event){
        console.log("clicked on not highlighted");
        var rowElem = $(event.target).closest('tr');
        var tds = rowElem.find('td');
        var index = $.inArray(event.target, tds);
        console.log("index", index);
        columnsToUse.push(index);
        highlightColumns(tableElement, columnsToUse);
        processFirstTable(currTable);
    };

    // first remove any highlighting we may have had in the past
    tableElement.find('tr td').filter('.highlighted-col').removeClass("highlighted-col");
    // and remove all handlers we've added in the past, since we may be about to change which columns are highlighted
    tableElement.find('tr td').off("click");

    // ok, let's highlight whatever columns we want highlighted now
    for (var i = 0; i < columnsToHighlight.length; i++){
      tableElement.find('tr td:nth-child('+(columnsToHighlight[i]+1)+')').addClass("highlighted-col");
    }

    // and let's add the handlers that will let the user change which columns are highlighted/used
    tableElement.find('tr td').filter('.highlighted-col').on("click", clickOnHighlighted);
    tableElement.find('tr td').filter(':not(.highlighted-col)').on("click", clickOnUnhighlighted);
  }

  var currTable = null;
  var columnsToUse = [];

  async function processFirstTable(table){
    currTable = table;
    var firstRow = currTable[0];
    if (columnsToUse.length < 1 && firstRow.length < 3){
      columnsToUse = [...Array(firstRow.length).keys()]
    }
    var outputNode = await guessOutputStructure(table, columnsToUse);
    visualizeOutput(outputNode);
  }

  function checkIfDates(colData){
    var formats = [
        moment.ISO_8601,
        moment.RFC_2822
    ]; // if we decide to allow some other data formats, we'll add them to this array.  todo: add any that we want
    // todo: it's important that we enforce that all cells use the same date format
    // so we should try formats one by one, discard them as we find dates that don't fit,
    // then only give up once we find there's no single format that works for all
    // this will be important for catching the mm-dd-yy versus dd-mm-yy confusion
    var numValid = 0;
    for (var i = 0; i < colData.length; i++){
      if (moment(colData[i], formats, true).isValid()){
        numValid += 1;
      }
    }
    if (numValid*1.0 / colData.length > .95){ // todo: is this a good threshold?
      return true;
    }
    return false;
  }

  function checkIfIntLiterals(colData){
    var numValid = 0;
    for (var i = 0; i < colData.length; i++){
      var str = colData[i].replace(/,/g,''); // remove commas in case it's an int displayed with commas
      // todo: the above is location dependent;  look into globalize library or other options
      // for doing this in a more robust way
      if (Number.isInteger(parseFloat(str))){
        numValid += 1;
      }
    } 
    if (numValid*1.0 / colData.length > .95){ // todo: is this a good threshold?
      return true;
    }
    return false;
  }

  function checkIfFloatLiterals(colData){
    var numValid = 0;
    for (var i = 0; i < colData.length; i++){
      var str = colData[i].replace(/,/g,''); // remove commas in case it's a float displayed with commas
      // todo: the above is location dependent;  look into globalize library or other options
      // for doing this in a more robust way
      if (parseFloat(str)){
        numValid += 1;
      }
    } 
    if (numValid*1.0 / colData.length > .95){ // todo: is this a good threshold?
      return true;
    }
    return false;
  }

  var responsesResolve = null;
  var responsesReject = null;

  var numCells = 0;
  var numApproved = 0;
  var numRejected = 0;

  // all we're going to do in this promise is make the resolve and reject handlers available
  // so that the wdkResponse, the handler we're using to handle incoming ajax responses
  // can call them as soon as the last ajax response comes in
  var waitForResponsesPromise = function(wdkurl) { 
    return new Promise(function(resolve, reject) {
      responsesResolve = resolve;
      responsesReject = reject;

      wdkResponse(null);
    });
  }

  function wdkResponse(data){
    // console.log(data);
    // for this response, if the wikidata list of results (data.search) has at least one entry
    // let's guess that it's a known entity
    if (data){
      if (data.search.length > 0){
        numApproved += 1;
      }
      else{
        numRejected += 1;
      }
    }
    // have we received responses for all the data cells?
    if ((numApproved + numRejected) >= numCells){
      // yep!  so let's go ahead and finish the promise
      responsesResolve(numApproved*1.0/numCells);
    }
  }

  async function checkIfKnownEntities(colData){
    numCells = colData.length;
    numApproved = 0;
    numRejected = 0;

    for (var i = 0; i < colData.length; i++){
      // first let's send off all this ajax requests
      var wdkurl = wdk.searchEntities(colData[i]);
      // console.log("url", wdkurl);
      $.ajax({
        dataType: "json",
        url: wdkurl,
        success: wdkResponse
      });
    }

    var realEntitiesOverAllCellsRatio = 0;
    // ok, now let's wait until all of those responses have come back
    // and we'll advance once we know the ratio of items that seem to be actual entities to cells in the column
    await waitForResponsesPromise().then(function(result) {
        console.log(result);
        realEntitiesOverAllCellsRatio = result;
      }, function(err) {
        console.log(err);
      });

    if (realEntitiesOverAllCellsRatio > 0.7){ // todo: is 0.7 a good threshold for this?
      return true;
    }
    return false;
  }

  const DataTypesEnum = {"dates":1, "intliterals":2, "floatliterals":3, "knownentities":4, "unknown":5};
  Object.freeze(DataTypesEnum);

  async function labelColumnTypes(table, columnsToUse){
    var columnTypes = [];
    for (var i = 0; i < columnsToUse.length; i++){
      var index = columnsToUse[i];
      var colData = table.map(row => row[index]);
      colData = colData.slice(1); // drop the header
      console.log(colData);
      // let's find out if the items in the column are
      // dates
      // integers
      // floats
      // known entities in wikidata
      var isDates = checkIfDates(colData);
      if (isDates) { columnTypes.push(DataTypesEnum.dates); continue; }
      var isInts = checkIfIntLiterals(colData);
      if (isInts) { columnTypes.push(DataTypesEnum.intliterals); continue; }
      var isFloats = checkIfFloatLiterals(colData);
      if (isFloats) { columnTypes.push(DataTypesEnum.floatliterals); continue; }
      var isEntities = await checkIfKnownEntities(colData);
      if (isEntities) { columnTypes.push(DataTypesEnum.knownentities); continue; }
      columnTypes.push(DataTypesEnum.unknown); // we couldn't figure it out
      // todo: a good way to speed up this process (especially because checking for entities
      // is very slow, requires potentially hundreds of ajax requests)
      // would be to cache the mapping from indexes to data types
      // but remember that you'd have to wipe out the mapping if you ever change the current table
    }
    console.log("columnTypes", columnTypes);
    return columnTypes;
  }

  async function guessOutputStructure(table, columnsToUse){
    var columnTypes = await labelColumnTypes(table, columnsToUse);

    if (columnsToUse.length == 2){
      // here's where we start predicting structures based on what data we have available
      if (columnTypes.indexOf(DataTypesEnum.dates) > -1 && 
        (columnTypes.indexOf(DataTypesEnum.intliterals) > -1 || columnTypes.indexOf(DataTypesEnum.floatliterals) > -1)){
        // we have dates mapped to some number literals
        // sounds like a single known entity might have these various values at different points in time
        // let's suggest this structure

        var datesIndex = columnTypes.indexOf(DataTypesEnum.dates);
        var intIndex = columnTypes.indexOf(DataTypesEnum.intliterals);
        var floatIndex = columnTypes.indexOf(DataTypesEnum.floatliterals); // one of these (int or float) will be -1

        var numNode = null;
        var numCol = null;
        if (intIndex > -1){
          var intIndexIntoTable = columnsToUse[intIndex];
          numCol = table.map(row => row[intIndexIntoTable]);
          numNode = new OutputStructure.IntLiteral(numCol);
        }
        else{
          // if we didn't find an int in the column times, then we must have found a float
          var floatIndexIntoTable = columnsToUse[floatIndex];
          numCol = table.map(row => row[floatIndexIntoTable]);
          numNode = new OutputStructure.FloatLiteral(numCol);
        }
        // and let's make our unknown entity data point
        var unknownEntityNode = new OutputStructure.SingleEntity(null);
        // connect them; for a relation label, we'll use the header of the numbers column
        var numbersHeader = numCol[0];
        var connection = unknownEntityNode.connect("has_" + numbersHeader, numNode);
        // and let's add the date to the connection
        var datesIndexIntoTable = columnsToUse[datesIndex];
        var datesCol = table.map(row => row[datesIndexIntoTable]);
        var dateNode = new OutputStructure.DateLiteral(datesCol);
        connection.addDataPointToConnection("on_date", dateNode);
        console.log(unknownEntityNode);
        return unknownEntityNode;
      }

      if (columnTypes.indexOf(DataTypesEnum.knownentities) > -1 && 
        (columnTypes.indexOf(DataTypesEnum.intliterals) > -1 || columnTypes.indexOf(DataTypesEnum.floatliterals) > -1)){
        // we have entities mapped to some number literals
        // sounds like these entities might have these various values
        // let's suggest this structure

        var entitiesIndex = columnTypes.indexOf(DataTypesEnum.knownentities);
        var intIndex = columnTypes.indexOf(DataTypesEnum.intliterals);
        var floatIndex = columnTypes.indexOf(DataTypesEnum.floatliterals); // one of these (int or float) will be -1

        var numNode = null;
        var numCol = null;
        if (intIndex > -1){
          var intIndexIntoTable = columnsToUse[intIndex];
          numCol = table.map(row => row[intIndexIntoTable]);
          numNode = new OutputStructure.IntLiteral(numCol);
        }
        else{
          // if we didn't find an int in the column times, then we must have found a float
          var floatIndexIntoTable = columnsToUse[floatIndex];
          numCol = table.map(row => row[floatIndexIntoTable]);
          numNode = new OutputStructure.FloatLiteral(numCol);
        }
        // and let's make our entity data point
        var entitiesIndexIntoTable = columnsToUse[entitiesIndex];
        var entitiesCol = table.map(row => row[entitiesIndexIntoTable]);
        var knownEntityNode = new OutputStructure.KnownEntity(entitiesCol);
        // connect them; for a relation label, we'll use the header of the numbers column
        var numbersHeader = numCol[0];
        var connection = knownEntityNode.connect("has_" + numbersHeader, numNode);

        return knownEntityNode;
      }
      else{
        console.log("Based on the types of the columns identified, we didn't have any predictions about structure.");
      }
    }
  }

  var currentlyVisualizedOutputNode = null;

  function visualizeOutput(outputNode){
    // todo: note that this only works if the output node we get as input is the first (not second) entity in the
    // only connection.  do better!
    $("#visualization-area").html("");
    if (outputNode){
      var targetDiv = $("#visualization-area");
      outputNode.makeVisualRepresentation(targetDiv);
      currentlyVisualizedOutputNode = outputNode;
    }
  }

  function exportAction(){
    var connections = currentlyVisualizedOutputNode.traverseForConnections();
    console.log("connections", connections);

    const store = new window.N3.Store();

    var freshTriplesRuns = 0;
    var freshTriplesHandler = function(triples){
      freshTriplesRuns += 1;
      for (var i = 0; i < triples.length; i++){
        store.addQuad(triples[i][0], triples[i][1], triples[i][2]);
      }
      if (freshTriplesRuns >= connections.length){
        // hey, we're done!  we can export.  
        // todo: once we're hooked up to backends, this is where we'll send off the triples
        console.log(store);
      }
    }

    for (var i = 0; i < connections.length; i++){
      var conn = connections[i];
      conn.makeTriples(freshTriplesHandler);
    }
  }

  function processNewTable(arrayOfArrays){
    // let's start updating the user's view
    $("#csv-data").append($("<div id='visualization-area'></div>"));
    var button = $("<button id='export'>Export Data</div>");
    $("#csv-data").append(button);
    buttonize(button, exportAction);
    $("#csv-data").append($("<p>Columns highlighted in green are the columns we plan to use.  Click on non-green columns to add them to the set we'll use.  Click on green columns to remove them from the set we'll use.</p>"));


    processFirstTable(arrayOfArrays);
    // and let's display them
    var sampleData = arrayOfArrays;
    if (sampleData.length > 100) {
      var sampleData = arrayOfArrays.slice(0,100); // only going to show a sample
      sampleData.push(new Array(arrayOfArrays[0].length).fill("...")); // to indicate to user that it's a sample
    }
    var tableElement = arrayOfArraysToTable(sampleData);
    highlightColumns(tableElement, columnsToUse);
    $("#csv-data").append(tableElement);
  }

  function processNewUploadedTableEvent(event){
    console.log("dropped file", event);
    var fileName = event.target.files[0].name;
    var fileReader = new FileReader();
    fileReader.onload = function (event) {
      
      var str = event.target.result;
      if (!str.endsWith("\n")){
        // sometimes the last row gets dropped because no newline at the end of it
        str = str + "\n";
      }
      // we have the file contents.  let's figure out our new table
      var csvData = $.csv.toArrays(str);

      processNewTable(csvData);
    }
    // now that we know how to handle reading data, let's actually read some
    fileReader.readAsText(event.target.files[0]);
  }

  function setUpDemoMode(){
    // todo: this is the very, very limitted version that only accepts one click (one positive example)
    // and only identifies things that are structured explicitly as HTML tables
    // but there are many more logical tables available on webpages
    // one of the key tasks will be extending this!

    var inDemoMode = true;

    var demoClick = function(event){

      if (inDemoMode){
        // normally a click might cause something to happen, like following a link
        // during demo mode we want to prevent that default behavior
        event.preventDefault();
        event.stopPropagation();
        console.log("demoClick");

        // ok, now we can decide what to do with the node that was clicked
        console.log(event);
        var node = event.target;
        // remember, we're assuming it's a cell in a table
        var table = $(node).closest("table");
        var arrayOfArrays = [];
        var targetRowLength = null;
        table.find("tr").each(function (i, row) {
            var rowArray = [];
            $(this).find("td, th").each(function(i, cell){
                var text = cell.textContent;
                var numRepetitions = 1;
                // take a look at wikipedia list of tallest mountains for an example of where colspan matters
                // have to line up the headers with the rows
                // todo: do something even more robust for this issue?
                if (cell.colSpan && cell.colSpan > 1){
                  numRepetitions = cell.colSpan;
                }
                var nextSegment = Array(numRepetitions).fill(text);
                rowArray = rowArray.concat(nextSegment);
            });
            if (targetRowLength === null){
              targetRowLength = rowArray.length;
            }
            if (rowArray.length === targetRowLength){
              arrayOfArrays.push(rowArray);
            }
            // for now, just throw away rows that are the wrong length (don't match the length of the headers)
        });
        console.log(arrayOfArrays);
        processNewTable(arrayOfArrays);
      }

      // let's turn off inDemoMode--because remember this is the bad version where we only allow one demo click
      inDemoMode = false;
    }

    // we have to be bound first (be the first handler to run)
    // because we'll need to prevent all normal handlers from running so we don't get taken away from the page
    $("*").bindFirst("click", demoClick); 
  }

  function buttonize(elem, handler){
    elem.button();
    elem.click(handler);
  }

  function switchToDemo(){
    $("#download-interaction-mode").css("display", "none");
    $("#demonstration-interaction-mode").css("display", "default");
    setTimeout(setUpDemoMode,0); // schedule it for right after this handler, so that this click doesn't get counted as a demo click
  }

  function switchToDownload(){
    $("#download-interaction-mode").css("display", "default");
    $("#demonstration-interaction-mode").css("display", "none");
  }

  var popuptext = `
  <div id="data_demo_frame">

  <div id="download-interaction-mode">
    <p>First, download your data.  Use CSV format.  Drag it into the box below when you're ready!</p>
    <input type='file' id="file-selector" accept='csv'>

    <div class="mode-switch">
      <p>No CSV download option?</p>
      <button id='switch-to-demo'>Click here to enter data demonstration mode instead</button>
    </div>
  </div>

  <div id="demonstration-interaction-mode" style="display: none">
    <p>Go ahead and start clicking on parts of the webpage that should be cells in your table of data.</p>

    <div class="mode-switch">
      <p>You're in data demonstration mode, but if you find a way to download the data as a CSV, you can just use that.</p>
      <button id='switch-to-download'>Click here to load CSV data instead</button>
    </div>
  </div>


  <div id='csv-data'></div>
  </div>
  `;

  function openPopup(state){
    console.log("openPopup");
    if (!popup_open){
      console.log("popup not yet open, about to open");
      
      // go ahead and make the dialog
      var dialogdiv  = $(popuptext);
      buttonize(dialogdiv.find("#switch-to-demo"), switchToDemo);
      buttonize(dialogdiv.find("#switch-to-download"), switchToDownload);
      var div = $("<div id='data_demo_popup_wrapper'></div>");
      div.append(dialogdiv);

      // set up handlers for the file uploading interaction

      var fileDragArea = div.find("#file-selector");
      fileDragArea.on("change", processNewUploadedTableEvent);
      // some appearance things for the file uploading interaction, just highlighting in blue
      fileDragArea.on("dragenter", change);
      fileDragArea.on("dragleave", change_back);
      function change() {
        console.log("change");
        fileDragArea.css("background-color", '#4688F4');
      };
      function change_back() {
        fileDragArea.css("background-color", 'inherit');
      };

      // ok, now add the dialog into the webpage
      document.body.insertBefore(div[0], document.body.lastChild.nextSibling);

      var width = 500;
      var height = 1000;

      // and let's actually make it a dialog
      div.dialog(
        {
          title: "Data Demonstration", 
          width: width, 
          height: height,
          position: {my: "left top", at: "left top", collision: "none"}
        });
      popup_open = true;
      popup_obj = div;
    }
    console.log("finished openPopup with popup_obj", popup_obj);

    // just let the background process know that the dialog is open
    chrome.runtime.sendMessage({ispopupopen: true});

  }

  chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log(request, sender);
    if (request.open_popup){
      // when background script tells us to open popup, open it
      openPopup(request.state);
    }
  });


})();
