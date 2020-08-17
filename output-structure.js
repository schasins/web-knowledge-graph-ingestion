var OutputStructure = (function _OutputStructure() {
  'use strict'

  var pub = {};

  const { namedNode, literal, defaultGraph, quad } = window.N3.DataFactory;

  var DataPoint = function _DataPoint(data){
  	if (data){
	  	this.columnHeader = data[0];
	  	this.columnData = data.slice(1);	
  	}
  	this.connections = [];

  	this.connect = function _connect(relationLabel, otherDataPoint){
  		var connection = new Connection(this, relationLabel, otherDataPoint);
  		this.connections.push(connection);
  		otherDataPoint.connections.push(connection);
  		return connection;
  	}

  	this.visualRepresentationInnerContent = function _visualRepresentationInnerContent(){
		var text = "";
		if (this.columnData){
			text = this.columnData[0]; // grab the first item in the data that isn't a header
		}
		return $("<span>"+text+"</span>");
  	}

  	var visualized = false;
  	var dataPointDiv = null;
  	this.makeVisualRepresentation = function _visualRepresentation(targetDOMElement){
  		if (!visualized){
	  		visualized = true;
  			var text = this.visualRepresentationInnerContent();
	  		var div = $("<div class='data-point'></div>");
	  		div.append(text);
	  		targetDOMElement.append(div);
	  		dataPointDiv = div;
	  		for (var i = 0; i < this.connections.length; i++){
	  			this.connections[i].makeVisualRepresentation(targetDOMElement);
	  		}
	  	}
  	}

  	this.updatePointVisualRepresentation = function _updatePointVisualRepresentation(){
  		var text = this.visualRepresentationInnerContent();
  		dataPointDiv.html(text); // use saved dataPointDiv
  	}

  	this.traverse = function _traverse(func){
  		this.traverseHelper(func, []);
  	}
  	this.traverseHelper = function _traverseHelper(argFunc, visitedSoFar){
  		if (visitedSoFar.indexOf(this) < 0){
	  		argFunc(this);
	  		visitedSoFar.push(this);

	  		for (var i = 0; i < this.connections.length; i++){
	  			this.connections[i].traverseHelper(argFunc, visitedSoFar);
	  		}
	  	}
  	}

  	this.traverseForConnections = function _traverseForConnections(){
  		var connections = [];
  		var argFunc = function(a){
  			if (a instanceof Connection){
  				connections.push(a);
  			}
  		}
  		this.traverse(argFunc);
  		return connections;
  	}

  }

  var Connection = function _Connction(dataPointA, relationLabel, dataPointB){
  	this.connectedDataPoints = [dataPointA, dataPointB];
  	this.relationLabel = relationLabel;
  	this.connectionAdditionalDataPoints = [];

  	this.addDataPointToConnection = function _addDataPointToConnection(relationLabel, dataPoint){
  		var cdp = new ConnectionDataPoint(this, relationLabel, dataPoint);
  		this.connectionAdditionalDataPoints.push(cdp);
  	}

  	function matchLengthOfAToB(singleNodeLs, multiNodeLs){
  		var targetLength = multiNodeLs.length;
  		singleNodeLs = singleNodeLs.push(...(Array(targetLength - 1).fill(singleNodeLs[0])));
  	}

  	function processDiffLengths(nodes1, nodes2){
  		if (nodes1.length == 1 || nodes2.length == 1){
  			// ok, we're in the case where we have a 1-to-n mapping, and we just want to repeat the node
  			// an appropriate number of times
  			if (nodes1.length > nodes2.length){
  				matchLengthOfAToB(nodes2, nodes1);
  			}
  			else{
  				matchLengthOfAToB(nodes1, nodes2);
  			}
  		}
  		else{
  			// ok, if they're different lengths and both have more than one, throw up our hands
  			// we just don't know what to do with that
  			console.log("Something has gone very wrong!  Why are we connecting data of length " + nodes1.length + " with data of length " + nodes2.length + "?");
  		}
  	}

  	this.makeTriples = function _makeTriples(callback){
		// todo: feel free to turn this into a promise and some async functions
		// for now we're just using callbacks

		var that = this;

  		this.connectedDataPoints[0].makeNodes(function(subjectNodes){

	  		that.connectedDataPoints[1].makeNodes(function(objectNodes){

		  		if (subjectNodes.length != objectNodes.length){
		  			processDiffLengths(subjectNodes, objectNodes);
		  		}
		  		// ok, we now have both of them having the same length
		  		// now we need to also make an array of predicate nodes with the same length
		  		var predNode = that.makePredicateNode();
		  		var predicateNodes = [predNode];
		  		matchLengthOfAToB(predicateNodes, subjectNodes);
		  		// and now all have the same length, so let's make some triples!
		  		var outputTriples = [];
		  		for (var i = 0; i < subjectNodes.length; i++){
		  			if (!subjectNodes[i] || !predicateNodes[i] || !objectNodes[i]){
		  				// todo: huge todo here!  just skipping rows where we don't have data isn't ok!
		  				// we really want to get enough info from the user that we can figure out
		  				// the proper node to use in every case
		  				// right now this will happen when we have a column of known entities
		  				// but our default way of guessing what entity is represented by a string doesn't yield a result
		  				continue;
		  			}
		  			outputTriples.push([subjectNodes[i], predicateNodes[i], objectNodes[i]]);
		  		}
		  		callback(outputTriples);
		  		// todo: make this function handle connectionAdditionalDataPoints
		  		// should probably use RDF* or reification
		  		// we don't handle this yet

	  		});

  		});
  	}

  	this.makePredicateNode = function _makePredicateNode(){
  		return literal(this.relationLabel); // turn it into an N3 literal
  	}

  	var visualized = false;
  	this.makeVisualRepresentation = function _visualRepresentation(targetDOMElement){
  		if (!visualized){
  			visualized = true;
  			// make sure first data point visualized already
  			this.connectedDataPoints[0].makeVisualRepresentation(targetDOMElement);
  			// now make a div that has all the info for this connection
  			// todo: the current setup is going to work for the very simple single-connection tests we're running now
  			// but *NOT* for future, more complicated graphs!  Definitely must revisit this for more complicated data
  			var div = $("<div class='data-connection'><div class='data-connection-label'>" + this.relationLabel + "</div></div>");
  			for (var i = 0; i < this.connectionAdditionalDataPoints.length; i++){
  				this.connectionAdditionalDataPoints[i].makeVisualRepresentation(div); // append it to this div instead of outer
  			}
  			targetDOMElement.append(div);
  			// finally, make sure second data point visualized
  			this.connectedDataPoints[1].makeVisualRepresentation(targetDOMElement);
  		}
  	}

  	this.traverseHelper = function __traverseHelper(argFunc, visitedSoFar){
  		if (visitedSoFar.indexOf(this) < 0){
	  		argFunc(this);
	  		visitedSoFar.push(this);

	  		for (var i = 0; i < this.connectionAdditionalDataPoints.length; i++){
	  			this.connectionAdditionalDataPoints[i].traverseHelper(argFunc, visitedSoFar);
	  		}
	  		for (var i = 0; i < this.connectedDataPoints.length; i++){
	  			this.connectedDataPoints[i].traverseHelper(argFunc, visitedSoFar);
	  		}
	  	}
  	}
  }

  var ConnectionDataPoint = function _ConnectionDataPoint(connection, relationLabel, dataPoint){
  	this.connection = connection;
  	this.relationLabel = relationLabel;
  	this.dataPoint = dataPoint;

  	var visualized = false;
  	this.makeVisualRepresentation = function _visualRepresentation(targetDOMElement){
  		if (!visualized){
  			visualized = true;
  			// we'll visualize the label, then the node
  			var div = $("<div class='connection-data-point'>" + this.relationLabel + "</div>");
  			this.dataPoint.makeVisualRepresentation(div); // append it to this div instead of outer
  			targetDOMElement.append(div);
  		}
  	}

  	this.traverseHelper = function __traverseHelper(argFunc, visitedSoFar){
  		if (visitedSoFar.indexOf(this) < 0){
	  		argFunc(this);
	  		visitedSoFar.push(this);
	  	}
  	}
  }

  pub.IntLiteral = function _IntLiteral(data){
  	DataPoint.call(this, data);

  	this.makeNodes = function _makeNodes(callback){
  		var nodes = [];
  		for (var i = 0; i < this.columnData.length; i++){
  			var lit = this.columnData[i].replace(/,/g,''); // remove commas in case it's an int displayed with commas
			// todo: the above is location dependent;  look into globalize library or other options
			// for doing this in a more robust way;
  			nodes.push(literal(parseInt(lit))); // make it into N3 literal
  		}
  		callback(nodes);
  	};
  };

  pub.FloatLiteral = function _FloatLiteral(data){
  	DataPoint.call(this, data);

  	this.makeNodes = function _makeNodes(callback){
  		var nodes = [];
  		for (var i = 0; i < this.columnData.length; i++){
  			var lit = this.columnData[i].replace(/,/g,''); // remove commas in case it's a float displayed with commas
			// todo: the above is location dependent;  look into globalize library or other options
			// for doing this in a more robust way;
  			nodes.push(literal(parseFloat(lit))); // make it into N3 literal
  		}
  		callback(nodes);
  	};
  };

  pub.DateLiteral = function _DateLiteral(data){
  	DataPoint.call(this, data);

  	this.makeNodes = function _makeNodes(callback){
  		var nodes = [];
  		for (var i = 0; i < this.columnData.length; i++){
  			var lit = this.columnData[i];
  			nodes.push(literal(parseDate(lit))); // make it into N3 literal
  			// todo: a couple todos here
  			// (1) should really use moment.js to parse these and make sure they all use the same format
  			// (see the other note about how important it is to use same format for each date)
  			// (2) find out if there's a proper way to do dates in N3.  there often is for RDF
  		}
  		callback(nodes);
  	};
  };

  pub.KnownEntity = function _KnownEntity(data){
  	DataPoint.call(this, data);

  	this.makeNodes = function _makeNodes(callback){

  		// todo: some huge todos here
  		// (1) we're going to do the laziest possible thing here and just assume that
  		// any entity that has at least one search result is the first response in the search results
  		// this is ok for making *guesses* about if a column represents entities
  		// but it's *not* ok for just exporting stuff!  we want to be much more accurate
  		// for example, if we're exporting a list of mountain names, we want to figure out that it's mountains
  		// and start only looking for wikidata entities that are classified as mountains
  		// (2) we're also just giving up on any entity where we don't have any search results
  		// so we're going to skip a bunch of stuff, which again, isn't ok
  		// for one thing, we want to make sure that what we're showing the user in the table, we're actually
  		// going to export.  (we should probably even have the table show the names of the entities we're finding
  		// in addition to the strings we've scraped from the webpage)
  		// what we really want here is to ask the user for enough information about how to manipulate the
  		// strings and how to search wikidata that we can get at least 99% of the data automatically
  		// we can maybe ask the user directly about a few items
  		// e.g., we could get the user to tell us to only use the string before the first slash
  		// or to filter to mountains.  we should be able to figure out the mountain thing on our own though

  		var nodes = [];
  		var numberOfResponsesToExpect = this.columnData.length;
  		var numberOfResponsesReceived = 0;

  		function makeHandlerWithIndex(ind){
  			var handler = function(data){
  				numberOfResponsesReceived += 1;
  				if (data.search.length > 0){
	  				var entityOfChoice = data.search[0];
	  				var urlForEntity = entityOfChoice.url;
	  				nodes[ind] = namedNode(urlForEntity); // make it into N3 namedNode
	  			}
	  			if (numberOfResponsesReceived >= numberOfResponsesToExpect){
	  				callback(nodes);
	  			}
  			}
  			return handler;
  		}

  		for (var i = 0; i < this.columnData.length; i++){
  			var str = this.columnData[i];
			var url = wdk.searchEntities(str);
			$.ajax({
				dataType: "json",
				url: url,
				success: makeHandlerWithIndex(i)
			});
  		}
  		return nodes;
  	};
  };

  pub.SingleEntity = function _SingleEntity(entityId, entityStringLabel){
  	DataPoint.call(this, null);
  	this.entityId = null;
  	this.entityStringLabel = null;
  	if (entityId){
  		this.entityId = entityId;
  	}
  	if (entityStringLabel){
  		this.entityStringLabel = entityStringLabel;
  	}

  	this.makeNodes = function _makeNodes(callback){
  		if (!this.entityId){
  			console.log("Hey!  You tried to export data before deciding what entity lives here:", this);
  		}
  		else{
  			// this one's easy.  we know the id -- it's this.entityId
  			var nodes = [namedNode("//www.wikidata.org/wiki/" + this.entityId)];
  			callback(nodes);
  		}
  	};


  	var textbox = null;

  	this.visualRepresentationInnerContent = function _visualRepresentationInnerContent(){
  		if (!this.entityId){
	  		var wrapper = $("<span></span>");
	  		var text = $("<span>Unknown Entity.  Please search by keyword:<br></span>");
	  		wrapper.append(text);
	  		var form = $("<form autocomplete='off'></form>");
	  		var container = $("<div class='autocomplete'></div>");
	  		form.append(container);
	  		textbox = $("<input class='wide' type='text'>");
	  		container.append(textbox);
	  		wrapper.append(form);

	  		var requestDataFunc = function _requestDataFunc(currentTypedString, handler){
				var url = wdk.searchEntities(textbox[0].value);
				console.log(url);
				$.ajax({
					dataType: "json",
					url: url,
					success: handler
				});
	  		};

	  		var processReceivedDataFunc = function _processReceivedDataFunc(data){
	  			var d = [];
	  			for (var i = 0; i < data.search.length; i++){
	  				var x = data.search[i];
	  				d.push({
	  				identifier: x.id,
	  				stringLabel: x.label,
	  				html: "<span class='wiki-label'>" + x.label + "</span><span class='wiki-description'>" + x.description + "</span>"
	  			});
	  			}
	  			return d;
	  		}

	  		var that = this;

	  		var processChooseFunc = function _processChooseFunc(chosenPair){
	  			console.log("chosenIdentifier", chosenPair);
	  			that.entityId = chosenPair[1];
	  			that.entityStringLabel = chosenPair[0];
	  			that.updatePointVisualRepresentation();
	  		}

	  		autocomplete(textbox[0], requestDataFunc, processReceivedDataFunc, processChooseFunc);
	  		return wrapper;
	  	}
	  	else{
	  		return $("<span>" + this.entityId + ": " + this.entityStringLabel + "</span>");
	  	}
  	}
  };

  return pub;
}());