'use strict';

(function ContentScript(){

  var popup_open = false;
  var popup_obj = null;
  var debug_mode = true;
  var clicked_nodes = [];

  function arrayOfTextsToTableRow(array, isElements=false){
    var $tr = $("<tr></tr>");
    for (var j= 0; j< array.length; j++){
      var $td = $("<td></td>");
      if (isElements){
        $td.append(array[j]);
      }
      else{
        $td.html(_.escape(array[j]).replace(/\n/g,"<br>")); 
      }
      $tr.append($td);
    }
    return $tr;
  };

  function arrayOfArraysToTable(arrayOfArrays){
    var $table = $("<table></table>");
    if (arrayOfArrays.length > 0){
      var headerCells = Array(arrayOfArrays[0].length).fill($("<div class='header'></div>"));
      var $tr = arrayOfTextsToTableRow(headerCells, true);
      $table.append($tr);
    }
    for (var i = 0; i < arrayOfArrays.length; i++){
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

  // todo: how much of this do you want to reuse every time user makes an edit, comes
  // up with new table?
  async function processFirstTable(table){
    currTable = table;
    var firstRow = currTable[0];
    columnsToUse = [...Array(firstRow.length).keys()]
    guessOutputStructure(table, columnsToUse);
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
    if (numValid*1.0 / colData.length > .7){ // todo: is this a good threshold?
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
    if (numValid*1.0 / colData.length > .7){ // todo: is this a good threshold?
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
    if (numValid*1.0 / colData.length > .7){ // todo: is this a good threshold?
      return true;
    }
    return false;
  }

  async function checkIfKnownEntities(colData){
    var wdkPromises = []
    // let's only check a sample
    // note this can make things slow when we do all these ajax requests
    // may not want to do this long-term, but we'll see.  doing it with a sample should be ok

    var limit = colData.length;
    if (colData.length > 20){
      limit = 20;
    }
    for (var i = 1; i < limit; i++){ // starting at 1 bc often headers
      // first let's send off all this ajax requests
      var wdkurl = wdk.searchEntities(colData[i]);
      // console.log("url", wdkurl);
      wdkPromises.push(
        new Promise(function (resolve, reject) {
          $.ajax({
            url: wdkurl,
            dataType: "json",
            success: function (data) {
              // console.log("data", data, data.search.length);
              resolve(data && data.search.length > 0); // true if there is at least one entity found
            },
            error: function (err) {
              reject(err);
            }
        })}));
    }

    // ok, now let's wait until all of those responses have come back
    // and calculate the ratio of items that seem to be actual entities to cells in the column
    return await Promise.all(wdkPromises).then(function(result) {
        var numApproved = result.reduce(
            (sum, isApproved) => (isApproved ? 1 : 0) + sum, 0)
        var realEntitiesOverAllCellsRatio = (numApproved*1.0)/(limit - 1);
        console.log(realEntitiesOverAllCellsRatio);
        return (realEntitiesOverAllCellsRatio > 0.5) // todo: is 0.5 a good threshold for this?
      }, function(err) {
        console.log(err);
      });
  }

  function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
  }

  const DataTypesEnum = {"dates":1, "intliterals":2, "floatliterals":3, "knownentities":4, "unknown":5};
  Object.freeze(DataTypesEnum);
  var columnTypeCache = [] // Caches the data types of the colums

  // todo: a good way to speed up this process (especially because checking for entities
  // is very slow, requires many ajax requests)
  // would be to cache the mapping from indexes to data types
  // but remember that you'd have to wipe out the mapping if you ever change the current table
  async function labelColumnTypes(table, columnsToUse){
    for (var i = 0; i < columnsToUse.length; i++){
      var index = columnsToUse[i];
      if (!(index in columnTypeCache)) {
        var colData = table.map(row => row[index]);
        colData = colData.slice(1); // drop the header
        console.log(colData);
        // let's find out if the items in the column are
        // dates, integers, floats, or known entities in wikidata
        if (checkIfDates(colData)) {columnTypeCache[index] = DataTypesEnum.dates;
        } else if (checkIfIntLiterals(colData)) {columnTypeCache[index] = DataTypesEnum.intliterals;
        } else if (checkIfFloatLiterals(colData)) {columnTypeCache[index] = DataTypesEnum.floatliterals;
        } else if (await checkIfKnownEntities(colData)) {columnTypeCache[index] = DataTypesEnum.knownentities;
        } else if (checkIfIntLiterals(colData)) {columnTypeCache[index] = DataTypesEnum.intliterals;
        } else {columnTypeCache[index] = DataTypesEnum.unknown;} // we couldn't figure it out
        }
    }
    console.log("column types", columnTypeCache);
    return columnTypeCache;
  }

  function addEntityRepresentationInHTMLTable(rowIndex, colIndex, wikidatasearchdata){
    var rowIndex = rowIndex + 1; // remember we've added a header!  again, ugh, maintaining two representations
    var row = $($("#csv-data").find("table")[0]).find("tr")[rowIndex];
    var cell = $($(row).find("td")[colIndex]);
    // console.log("cell", cell);
    // console.log("search", wikidatasearchdata[0]);
    var url = wikidatasearchdata[0].url;
    var name = wikidatasearchdata[0].label;
    var id = wikidatasearchdata[0].id;
    var newEntity = $(`<a href=${url} target='_blank'>${name}(${id})</a>`);
    var eSpan = null;
    var entitySpans = $(cell).find(".entity-link");
    if (entitySpans.length > 0){
      eSpan = $(entitySpans[0]);
      eSpan.html("");
    }
    else{
      eSpan = $("<span class='entity-link'></span>");
      cell.append(eSpan);
    }
    eSpan.append(newEntity);
  }

  function replaceHeaderContents(columnIndex, content){
    // todo: you may eventually want to have multiple things in header, so could
    // also pass in a selector that tells you which part of header cell to modify
    var firstRow = $($("#csv-data").find("table")[0]).find("tr")[0];
    var headerCell = $(firstRow).find("td")[columnIndex];
    $(headerCell).html(content);
  }

  function labelColumnTypesUserVisible(columnTypes){
    console.log("columnTypes", columnTypes);
    for (var i = 0; i < columnTypes.length; i++){
      replaceHeaderContents(i, getKeyByValue(DataTypesEnum, columnTypes[i]));
    }
  }

  function showUserVisibleKnowledgeGraphEntities(table, columnTypes){
    for (var i = 0; i < columnTypes.length; i++){
      if (columnTypes[i] === DataTypesEnum.knownentities){
        for (var row = 0; row < table.length; row++){
          function processOneEntityString(rowIndex, colIndex){

            var entityString = table[rowIndex][colIndex];

            // todo: man, keeping track of this via row and col index is messy!
            // especially because we're keeping these parallel tables, the one in JS
            // memory and the one in HTML
            // probably better to have an internal representation of the table
            // and regenerate the HTML table occasionally
            // but this messy version will work for now

            var wdkurl = wdk.searchEntities(entityString);
            // console.log("url", wdkurl);
            $.ajax({
              url: wdkurl,
              dataType: "json",
              success: function (data) {
                // console.log("data", data, data.search.length);
                if (data && data.search.length > 0){
                  addEntityRepresentationInHTMLTable(rowIndex, colIndex, data.search);
                }
              },
              error: function (err) {
                reject(err);
              }
              });
          }
          processOneEntityString(row, i);
        }
      }
    }
  }

  async function guessOutputStructure(table, columnsToUse){
    var columnTypes = await labelColumnTypes(table, columnsToUse);
    // now we'll label the columns according to what we think they are
    // todo: eventually user should be able to correct the guessed column types
    labelColumnTypesUserVisible(columnTypes);
    // now that we have an idea of what's knowledge graph entities, let's label
    // those to be user-visible as well!
    showUserVisibleKnowledgeGraphEntities(table, columnTypes);
  }

  function createDataObject(name, ownerid, description, datafile, comment){

    var metadata = {
        'name': name,
        'owner_id': ownerid,
        'description': description,
        'comment': comment,
        'datatype': '/datatypes/csv',
        'mimetype': 'text/csv',
        'predecessors': []
    };

    chrome.runtime.sendMessage({msgtype: "postcsv", metadata: JSON.stringify(metadata), datafile: datafile}, function(response) {});
  }

  function makeCSVText(){
    // let's pop out the CSV
    console.log("currCSV", currTable);
    var currCSVText = $.csv.fromArrays(currTable);
    console.log("currCSVText", currCSVText);
    return currCSVText;
  }

  function exportAction(){
    var currCSVText = makeCSVText();

    // obviously change to actually looking up the ownerId at some point!
    // shouldn't always just be Mike's ID (even though Mike is #1!)

    var csv_obj_data = createDataObject('Sample extracted data', 1,'Sample CSV data file',currCSVText,'Uploaded from lightweight extraction tool');

  }

  function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }

  function downloadAction(){
    var currCSVText = makeCSVText();

    // Start file download.
    download("extracted.csv", currCSVText); // should use more informative name!
  }

  function processNewTable(arrayOfArrays){
    columnTypeCache = []
    // let's start updating the user's view
    $("#csv-data").append($("<div id='visualization-area'></div>"));
    var button = $("<button id='export'>Export Data</div>");
    $("#csv-data").append(button);
    buttonize(button, exportAction);
    var button2 = $("<button id='download'>Download Data</div>");
    $("#csv-data").append(button2);
    buttonize(button2, downloadAction);
    $("#csv-data").append($("<p>Columns highlighted in green are the columns we plan to export.  Click on non-green columns to add them to the set we'll use.  Click on green columns to remove them from the set we'll use.</p>"));

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
