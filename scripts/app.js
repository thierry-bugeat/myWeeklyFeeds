/**
 * Copyright 2015 Thierry BUGEAT
 * 
 * This file is part of myFeeds.
 * 
 * myFeeds is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * myFeeds is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with myFeeds.  If not, see <http://www.gnu.org/licenses/>.
 */
    
    var my = new MyFeeds();
    var ui = new MyUi();
    var myManifest = my._loadJSON('manifest.webapp');

    var theoldreader = new TheOldReader();
    var feedly = new Feedly();

    var gf = new GoogleFeed();

    var myFeedsSubscriptions = {'local': [], 'feedly': [], 'theoldreader': []} ; // Store informations about feeds (urls)

    var params = {
        "version": 1,
        "feeds": {
            "selectedFeed": "",                 // Display all feeds if empty otherwise display specified feed url
            "defaultPulsations": 5              // Default feed pulsations
        },
        "entries": {
            "nbDaysAgo": 0,                     // Display only today's entries
            "maxLengthForSmallEntries": "400",  // Max number of characters to display an entry as small entry
            "dontDisplayEntriesOlderThan": "7", // In days
            "displaySmallEntries": false,       // Display small entries. true, false
            "updateEvery": 900,                 // Update entries every N seconds
            "theme": "list"                     // card, list(default), grid
        },
        "accounts": {
            "local": {
                "title": "Local",
                "logged": true
            },
            "feedly": {
                "title": "Feedly",
                "logged": false
            },
            "theoldreader": {
                "title": "The Old Reader",
                "logged": false
            }
        },
        "settings": {
            "ui": {
                "animations": false,            // Use transitions animations
                "vibrate": true                 // Vibration on click
            },
            "developper_menu": {
                "visible": false,               // Display or not developper menu in settings
                "logs": {
                    "console": false,           // Developper logs in console
                    "screen": false             // Developper logs on screen
                }
            },
            "update": {
                "every": [300, 900, 1800, 3600] // In seconds 5mn, 15mn, 30mn, 60mn
            },
            "days": [3, 5, 7, 10]
        }
    }
    
    var liveValues = {
        "timestamps": {
            "min": -1,                          // Timestamp value beyond which an entry can't be displayed (Too old). Set by function "_setTimestamps()"
            "max": -1                           // End of current day (23:59:59). Set by function "_setTimestamps()"
        },
        "entries": {
            "id": {
                "min": -1,                      // Set by function "setEntriesIds"
                "max": -1                       // Set by function "setEntriesIds"
                                                // Depends of: 
                                                // - params.entries.dontDisplayEntriesOlderThan
                                                // - isSmallEntry()
                                                // - search keyword value
            },
            "search": {
                "visible": false                // Form search entries by keyword is visible or not
            }
        }
    }
    
    var keywords = [];

    var _entriesUpdateInterval = '';
    
    var _dspEntriesTimeout = '';
    
    var _loginInProgress = {"local": false, "feedly": false, "theoldreader": false}

    // Network Connection

    var _onLine = "NA";
    
    var _previousNbDaysAgo = -1;

    // Load params from SDCard.
    // Create file if doesn't exists.

    my._load('params.json').then(function(_myParams) {
        my.log('loading params from file params.json ...', _myParams);
        
        if (params.version > _myParams.version) {
            params.accounts = _myParams.accounts; // Keep user accounts
            _saveParams();
        } else {
            params = _myParams;
        }
        
        ui.selectThemeIcon();
        
        // Get and set Feedly token from cache then try to update token.
        if (params.accounts.feedly.logged) {
            my._load('cache/feedly/access_token.json').then(function(_token){
                feedly.setToken(_token);
                if (navigator.onLine) {
                    feedly.getSubscriptions();
                }
            }).catch(function(error) {
                my.alert("Can't load and set Feedly token");
                _disableAccount('feedly');
            }).then(function(){
                if (navigator.onLine) {
                    my.log("Try to update Feedly token...");
                    feedly.updateToken();
                }
            }).catch(function(error) {
                my.log("Can't update Feedly token");
            });
        }
        // Get and set The Old Reader token from cache
        if (params.accounts.theoldreader.logged) {
            my._load('cache/theoldreader/access_token.json').then(function(_token){
                theoldreader.setToken(_token);
                if (navigator.onLine) {
                    theoldreader.getSubscriptions();
                }
                document.getElementById('theoldreaderForm').style.cssText = 'display: none';
            }).catch(function(error) {
                my.alert("Can't load and set T.O.R. token");
                _disableAccount('theoldreader');
            });
        }
    }).catch(function(error) {
        _saveParams();
    });
    
    // Load keywords from SDCard.
    // Create file if doesn't exists.

    my._load('keywords.json').then(function(_myKeywords) {
        my.log('loading keywords from file keywords.json ...', _myKeywords);
        keywords = _myKeywords;
    }).catch(function(error) {
        _saveKeywords();
    });

    // ---

    var sortedEntries = [];
    var sortedFeeds = [];

    sync.onclick            = function(event) {
        if (navigator.onLine) {
            ui._vibrate();
            ui._onclick(this, 'disable');
            gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
        }
    }
    menu.onclick            = function(event) { ui._vibrate(); ui._scrollTo(1); }
    closeMainEntry.onclick  = function(event) { ui._vibrate(); ui._quickScrollTo(2); ui.echo("browser", "", ""); }
    closeFeedsList.onclick  = function(event) { ui._vibrate(); ui._scrollTo(2); }
    findFeedsOpen.onclick   = function(event) { ui._vibrate(); ui._scrollTo(0); }
    findFeedsClose.onclick  = function(event) { ui._vibrate(); ui._scrollTo(1); }
    
    findFeedsSubmit.onclick = function(event) { 
        ui._vibrate();
        var _keywords = document.getElementById("findFeedsText").value; 
        if (_keywords) {
            ui.echo("find-feeds", "Loading...", ""); 
            gf.findFeeds(_keywords).then(function(results) {
                my.log("Find feed ok", results);
            }).catch(function(error) {
                my.message(document.webL10n.get("find-feeds-error") + JSON.stringify(error));
            });
        }
    }
    
    findFeedsReset.onclick  = function(event) { ui._vibrate(); ui.echo('find-feeds', '', ''); }
    settingsOpen.onclick    = function(event) { ui._vibrate(); ui._scrollTo(3); }
    settingsClose.onclick   = function(event) { ui._vibrate(); ui._scrollTo(2); }
    displayGrid.onclick     = function(event) {
        if (params.entries.theme != 'grid') {
            params.entries.theme = "grid";
            ui._vibrate();
            ui.selectThemeIcon();
            dspEntries(gf.getEntries(), params.entries.nbDaysAgo, params.feeds.selectedFeed);
            _saveParams();
        }
    }
    displayCard.onclick     = function(event) {
        if (params.entries.theme != 'card') {
            params.entries.theme = "card";
            ui._vibrate();
            ui.selectThemeIcon();
            dspEntries(gf.getEntries(), params.entries.nbDaysAgo, params.feeds.selectedFeed);
            _saveParams();
        }
    }
    displayList.onclick     = function(event) {
        if (params.entries.theme != 'list') {
            params.entries.theme = "list";
            ui._vibrate();
            ui.selectThemeIcon();
            dspEntries(gf.getEntries(), params.entries.nbDaysAgo, params.feeds.selectedFeed);
            _saveParams();
        }
    }
    
    /**
     * Show entries matching string and hide others
     * @param {string} string Min length 5 characters or "" to reset display
     * */
    var _search = function(string) {

        if ((string.length > 2) || (string === '')) {
            var _divs = document.querySelectorAll("div.my-list-entry-s, div.my-list-entry-m, div.my-list-entry-l, div.my-grid-entry-s, div.my-grid-entry-m, div.my-grid-entry-l, div.my-card-entry-s, div.my-card-entry-m, div.my-card-entry-l");
            
            _nb = _divs.length;
            
            for (var i = 0; i < _nb; i++) {
                if ((_divs[i].classList.contains("_small_")) && (!params.entries.displaySmallEntries)) {
                    _divs[i].classList.remove('_show');
                    _divs[i].classList.add('_hide');
                } else {
                    var _text = _divs[i].textContent.toLowerCase();
                    if ((string == '') || (_text.indexOf(string.toLowerCase()) >= 0)) {
                        _divs[i].classList.remove('_hide')
                        _divs[i].classList.add('_show');
                    } else {
                        _divs[i].classList.remove('_show');
                        _divs[i].classList.add('_hide');
                    }
                }
            }
        }
    }
    
    searchEntries.onclick = function(string) {
        
        ui._vibrate();
        
        if (liveValues['entries']['search']['visible'] && document.getElementById('formSearchEntries').classList.contains("_hide")) {
        } else if (liveValues['entries']['search']['visible'] && document.getElementById('formSearchEntries').classList.contains("_show")) {
            liveValues['entries']['search']['visible'] = !liveValues['entries']['search']['visible'];
        } else if (!liveValues['entries']['search']['visible'] && document.getElementById('formSearchEntries').classList.contains("_hide")) {
            liveValues['entries']['search']['visible'] = !liveValues['entries']['search']['visible'];
        } else if (!liveValues['entries']['search']['visible'] && document.getElementById('formSearchEntries').classList.contains("_show")) {
        }
        
        //liveValues['entries']['search']['visible'] = !liveValues['entries']['search']['visible'];
        
        if (liveValues['entries']['search']['visible']) {
            feeds_entries.style.height = "calc(100% - 17.5rem)";
            searchEntries.classList.remove('enable-fxos-white');
            searchEntries.classList.add('enable-fxos-blue');
            document.getElementById('formSearchEntries').classList.remove('_hide');
            document.getElementById('formSearchEntries').classList.add('_show');
            document.getElementById('inputSearchEntries').focus();
            _search(document.getElementById('inputSearchEntries').value);
        } else {
            feeds_entries.style.height = "calc(100% - 13.5rem)";
            searchEntries.classList.remove('enable-fxos-blue');
            searchEntries.classList.add('enable-fxos-white');
            document.getElementById('formSearchEntries').classList.remove('_show');
            document.getElementById('formSearchEntries').classList.add('_hide');
            _search('');
        }

    }
    
    resetSearchEntries.onclick = function() {
        ui._vibrate();
        _search('');
    }
    
    /**
     * Save subscriptions for specified account
     * @param {boolean} _logsOnScreen Display or not logs on screen.
     *                                Overwrite settings.
     * */
    function _saveSubscriptions(_logsOnScreen) {
        
        for (var _account in myFeedsSubscriptions) {

            var _output = [];
            var _feeds = gf.getFeeds();
            var _feed = "";
            
            for (var i = 0 ; i < _feeds.length; i++) {
                if ( _feeds[i]._myAccount == _account) {
                    _url = _feeds[i].feedUrl;
                    
                    if ((isNaN(_feeds[i]._myPulsations)) || (_feeds[i]._myPulsations == "Infinity")){
                        _feeds[i]._myPulsations = "0.1";
                    }
                    
                    _feed = {"url": _url, "pulsations": _feeds[i]._myPulsations, "account": _feeds[i]._myAccount, "id": _feeds[i]._myFeedId};
                    _output.push(_feed);
                }
            }

            my._save("subscriptions." + _account + ".json", "application/json", JSON.stringify(_output)).then(function(results) {
                my.log('Save subscriptions : ' + results);
                if (_logsOnScreen) {
                    my.message('Backup completed : ' + results);
                }
            }).catch(function(error) {
                my.error("ERROR saving file ", error);
                if (_logsOnScreen) {
                    my.alert("ERROR saving file " + error.filename);
                }
            });
            
        }
    }

    nextDay.onclick = function(event) {
        ui._vibrate();
        if (params.entries.nbDaysAgo > 0 ) {
            params.entries.nbDaysAgo--;
        }
        ui._onclick(previousDay, 'enable');
        if (params.entries.nbDaysAgo == 0) {
            ui._onclick(nextDay, 'disable');
        } else {
            ui._onclick(nextDay, 'enable');
        }
        dspEntries(gf.getEntries(), params.entries.nbDaysAgo, params.feeds.selectedFeed);
        feeds_entries.scrollTop = 0;
    }

    previousDay.onclick = function(event) {
        ui._vibrate();
        if (params.entries.nbDaysAgo < params.entries.dontDisplayEntriesOlderThan) {
            params.entries.nbDaysAgo++;
        }
        ui._onclick(nextDay, 'enable');
        if (params.entries.nbDaysAgo == params.entries.dontDisplayEntriesOlderThan) {
            ui._onclick(previousDay, 'disable');
        } else {
            ui._onclick(previousDay, 'enable');
        }
        dspEntries(gf.getEntries(), params.entries.nbDaysAgo, params.feeds.selectedFeed);
        feeds_entries.scrollTop = 0;
    }
    
    function deleteKeyword(_this) {
        my.log('deleteKeyword() ', arguments);

        var _myKeyword = _this.getAttribute("myKeyword");

        var _confirm = window.confirm(document.webL10n.get('confirm-delete-keyword') + "\n" + _myKeyword);

        if (_confirm) {
            
            ui.fade(_this);

            var _tmp = [];

            // (1) Delete myKeyword from array "keyword"

            for (var i = 0; i < keywords.length; i++) {
                if (keywords[i] != _myKeyword) {
                    _tmp.push(keywords[i]);
                }
            }

            keywords = _tmp.slice();
            
            _saveKeywords();

            // (2) Reload UI

            if ((myFeedsSubscriptions.local.length > 0) ||
                (myFeedsSubscriptions.feedly.length > 0) ||
                (myFeedsSubscriptions.theoldreader.length > 0)
            ){
                gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
            } else {
                ui.echo("feeds-list", "", "");
                ui.echo("feeds-entries", "", "");
                ui._onclick(sync, 'disable');
            }
        }
    }

    function deleteFeed(_this) {
        my.log('deleteFeed() ', arguments);

        var _feedId = _this.getAttribute("feedId");
        var _account = _this.getAttribute("account");
        var _confirm = window.confirm(_account + ' : ' + document.webL10n.get('confirm-delete-feed') + "\n" + _feedId);

        if (_confirm) {

            var _tmp = [];

            ui.fade(_this);

            // (1) Delete feedId from array "myFeedsSubscriptions[_account]"

            for (var i = 0; i < myFeedsSubscriptions[_account].length; i++) {
                if (myFeedsSubscriptions[_account][i].id != _feedId) {
                    //delete myFeedsSubscriptions.local[i];
                    _tmp.push(myFeedsSubscriptions[_account][i]);
                    //break;
                }
            }

            myFeedsSubscriptions[_account] = _tmp.slice();

            // (3a) Delete from Local
            
            if (_account == 'local') {
                my._save("subscriptions." + _account + ".json", "application/json", JSON.stringify(myFeedsSubscriptions.local)).then(function(results) {
                    my.message(document.webL10n.get('feed-has-been-deleted'));
                }).catch(function(error) {
                    my.error("ERROR saving file ", error);
                    my.alert("ERROR saving file " + error.filename);
                });
            }

            // (3b) Delete from Feedly

            if (_account == 'feedly') {
                feedly.deleteSubscription(_feedId).then(function(response){
                    my.message(document.webL10n.get('feed-has-been-deleted'));
                    my._save("subscriptions." + _account + ".json", "application/json", JSON.stringify(myFeedsSubscriptions[_account])).then(function(results) {
                        my.log('Save subscriptions.' + _account + '.json');
                    }).catch(function(error) {
                        my.error("ERROR saving file ", error);
                        my.alert("ERROR saving file " + error.filename);
                    });
                }).catch(function(error) {
                    my.message(document.webL10n.get('error-cant-delete-this-feed'));
                    my.error(error);
                });
            }

            // (3c) Delete from TheOldReader

            if (_account == 'theoldreader') {
                theoldreader.deleteSubscription(_feedId).then(function(response){
                    my.message(document.webL10n.get('feed-has-been-deleted'));
                    my._save("subscriptions." + _account + ".json", "application/json", JSON.stringify(myFeedsSubscriptions[_account])).then(function(results) {
                        my.log('Save subscriptions.' + _account + '.json');
                    }).catch(function(error) {
                        my.error("ERROR saving file ", error);
                        my.alert("ERROR saving file " + error.filename);
                    });
                }).catch(function(error) {
                    my.message(document.webL10n.get('error-cant-delete-this-feed'));
                    my.error(error);
                });
            }
            
            // (4) Delete entries
            
            gf.deleteEntries(_account, _feedId);

            // (5) Reload UI

            if ((myFeedsSubscriptions.local.length > 0) ||
                (myFeedsSubscriptions.feedly.length > 0) ||
                (myFeedsSubscriptions.theoldreader.length > 0)
            ){
                gf.setFeedsSubscriptions(myFeedsSubscriptions);
                gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
            } else {
                ui.echo("feeds-list", "", "");
                ui.echo("feeds-entries", "", "");
                ui._onclick(sync, 'disable');
            }
        }
    }

    function findFeedsDisplayResults(event) {
        my.log('findFeedsDisplayResults()', arguments);
        my.log(event);

        if ((event.detail.responseStatus == 200) && (event.detail.responseData.entries.length > 0)) {
            var _results = event.detail.responseData.entries;
            var _htmlResults = "<ul>";

            for (var i = 0 ; i < _results.length; i++) {
                
                // Is feed already in subscriptions ?
                
                var _feedAlreadySubscribed = false;
                
                for (var _account in myFeedsSubscriptions) {
                    for (var j = 0; j < myFeedsSubscriptions[_account].length; j++) {
                        if (_results[i].url == myFeedsSubscriptions[_account][j]["url"]) {
                            _feedAlreadySubscribed = true;
                            break;
                        }
                    }
                }
                
                // ---
                
                if (!_feedAlreadySubscribed) {
                    _htmlResults = _htmlResults + '<li><a><button class="addNewFeed" feedUrl="' + _results[i].url + '" feedId="' + _results[i].url + '" ><span data-icon="add"></span></button><p>' + _results[i].title + '</p><p><time>' + _results[i].url + '</time></p></a></li>';
                } else {
                    _htmlResults = _htmlResults + '<li><a><button class="cantAddNewFeed warning"><span class="fa fa-ban fa-2x"></span></button><p>' + _results[i].title + '</p><p><time>' + _results[i].url + '</time></p><p class="warning">' + document.webL10n.get('feed-already-subscribed') + '</p></a></li>';
                }
            }

            _htmlResults = _htmlResults + "</ul>";

            ui.echo("find-feeds", _htmlResults, "");

            // ==================
            // --- Add Events ---
            // ==================

            // onclick add button :

            var _adds = document.querySelectorAll(".addNewFeed");

            for (var i = 0; i < _adds.length; i++) {
                _adds[i].onclick = function() { 
                    ui._vibrate();
                    findFeedsAddNewFeed(this);
                }
            }
        } else if (event.detail.responseData.entries.length == 0) {
            ui.echo("find-feeds", document.webL10n.get('find-feeds-no-results'), "");
        } else {
            ui.echo("find-feeds", "Find feeds : Network error", "prepend");
        }
    }

    function findFeedsAddNewFeed(_this) {
        my.log('findFeedsAddNewFeed() ', arguments);

        var _feedUrl = _this.getAttribute("feedUrl");
        var _feedId  = _this.getAttribute("feedId");
        var _confirm = window.confirm(document.webL10n.get('confirm-add-feed'));

        if (_confirm) {

            var _myNewFeed = {"url": _feedUrl, "pulsations": params['feeds']['defaultPulsations'], "account": "local", "id": _feedId};
            var _myNewFeed = {"url": _feedUrl, "pulsations": params['feeds']['defaultPulsations'], "account": "local", "id": _feedUrl};

            // (1) Add feedUrl to array "myFeedsSubscriptions.local"

            myFeedsSubscriptions.local.push(_myNewFeed);

            // (2) Reload UI

            gf.setFeedsSubscriptions(myFeedsSubscriptions);
            gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
            
            // (3) Save subscriptions.local.json
            
            my._save("subscriptions.local.json", "application/json", JSON.stringify(myFeedsSubscriptions.local)).then(function(results) {
                ui.echo("find-feeds", "", "");
                my.message(document.webL10n.get('feed-subscription-was-added'));
            }).catch(function(error) {
                my.error("ERROR saving file ", error);
                my.alert("ERROR saving file " + error.filename);
            });
        }
    }

    function dspSettings() {
        var start = performance.now();
        
        var _now = new Date();
        
        // Vibrate on click
        
        if (params.settings.ui.vibrate) {
            _vibrateOnClick = 'checked=""';
        } else {
            _vibrateOnClick = "";
        }

        // Small entries selector

        if (params.entries.displaySmallEntries) {
            _displaySmallEntriesChecked = 'checked=""';
        } else {
            _displaySmallEntriesChecked = "";
        }

        // Feedly selector

        if (params.accounts.feedly.logged) {
            _feedlyAccount = 'checked=""';
        } else {
            _feedlyAccount = "";
        }

        // The Old Reader selector

        if (params.accounts.theoldreader.logged) {
            _theoldreaderAccount = 'checked=""';
        } else {
            _theoldreaderAccount = "";
        }

        // Use animations selector

        if (params.settings.ui.animations) {
            _useAnimations = 'checked=""';
        } else {
            _useAnimations = "";
        }
        
        // Logs console selector

        params.settings.developper_menu.logs.console ?
            _logsConsole = 'checked=""':
            _logsConsole = "";
            
        // Logs screen selector

        params.settings.developper_menu.logs.screen ?
            _logsScreen = 'checked=""':
            _logsScreen = "";

        // Update every

        var _every = params.settings.update.every;
        var _htmlSelectUpdateEvery = "";
        var _selected = "";

        _htmlSelectUpdateEvery = _htmlSelectUpdateEvery + '<select id="selectUpdateEvery">';

        for (var i = 0; i < _every.length; i++) {
            if (params.entries.updateEvery == _every[i]) {
                _selected = "selected";
            } else {
                _selected = "";
            }
            _htmlSelectUpdateEvery = _htmlSelectUpdateEvery + '<option value="' + _every[i] + '" ' + _selected + ' >' + Math.floor(_every[i] / 60) + 'min</option>';
        }

        _htmlSelectUpdateEvery = _htmlSelectUpdateEvery + '</select>';

        // Max nb Days

        var _days = params.settings.days;
        var _htmlMaxNbDays = "";
        var _selected = "";

        _htmlMaxNbDays = _htmlMaxNbDays + '<select id="selectMaxNbDays">';

        for (var i = 0; i < _days.length; i++) {
            if (params.entries.dontDisplayEntriesOlderThan == _days[i]) {
                _selected = "selected";
            } else {
                _selected = "";
            }
            _htmlMaxNbDays = _htmlMaxNbDays + '<option value="' + _days[i] + '" ' + _selected + ' >' + _days[i] + '</option>';
        }

        _htmlMaxNbDays = _htmlMaxNbDays + '</select>';

        // ---

        var _htmlSettings = [
        '<h2>' + document.webL10n.get('settings-feeds') + '</h2>                                                                                            ',
        '<ul>                                                                                                                                               ',
        '   <li class="_online_"><span data-icon="reload"></span>' + document.webL10n.get('settings-last-update') + _now.toLocaleTimeString(userLocale) + '</li>      ',
        '   <li class="_online_"><span data-icon="sync"></span>' + document.webL10n.get('settings-update-every') + _htmlSelectUpdateEvery + '</li>          ',
        '</ul>                                                                                                                                              ',
        '<h2>' + document.webL10n.get('settings-news') + '</h2>                                                                                             ',
        '<ul>                                                                                                                                               ',
        '   <li><span data-icon="messages"></span>' + document.webL10n.get('settings-small-news') + '<div><label class="pack-switch"><input id="toggleDisplaySmallEntries" type="checkbox" ' + _displaySmallEntriesChecked + '><span></span></label></div></li>',
        '   <li><span data-icon="messages"></span>' + document.webL10n.get('settings-number-of-days') + _htmlMaxNbDays + '</li>                             ',
        '</ul>                                                                                                                                              ',
        '<h2>' + document.webL10n.get('settings-online-accounts') + '</h2>                                                                                  ',
        '<ul class="feedly theoldreader">                                                                                                                   ',
        '   <li class="_online_"><span data-icon="messages"></span>Feedly<div><label class="pack-switch"><input id="feedlyLogin" type="checkbox" ' + _feedlyAccount + '><span></span></label></div></li>',
        '   <li class="_online_">',
        '       <span data-icon="messages"></span>The Old Reader<div><label class="pack-switch"><input id="theoldreaderCheckbox" type="checkbox" ' + _theoldreaderAccount + '><span></span></label></div>',
        '       <div id="theoldreaderForm">                                                                                                                 ',
        '           <p><input id="theoldreaderEmail" required="" placeholder="Email" name="theoldreaderEmail" type="email" value=""></p>                    ',
        '           <p><input id="theoldreaderPasswd" required="" placeholder="Password" name="theoldreaderPasswd" type="password" value=""><p>             ',
        '       </divn>                                                                                                                                     ',
        '   </li>                                                                                                                                           ',
        '</ul>                                                                                                                                              ',
        '<h2>' + document.webL10n.get('user-interface') + '</h2>                                                                                            ',
        '<ul>                                                                                                                                               ',
        '   <li><span data-icon="vibrate"></span>' + document.webL10n.get('vibrate-on-click') + '<div><label class="pack-switch"><input id="toggleVibrate" type="checkbox" ' + _vibrateOnClick + '><span></span></label></div></li>',
        '</ul>                                                                                                                                              ',
        '<h2>' + document.webL10n.get('about') + '</h2>                                                                                                     ',
        '<ul>                                                                                                                                               ',
        '   <li id="appVersion"><span data-icon="messages"></span>' + document.webL10n.get('app-title') + '<div>' + myManifest.version + '</div></li>       ',
        '   <li><span data-icon="messages"></span>' + document.webL10n.get('author') + '<div>' + myManifest.developer.name + '</div></li>                   ',
        '   <li class="about _online_"><span data-icon="messages"></span>' + document.webL10n.get('website') + '<div><a href="' + myManifest.developer.url + '" target="_blank">url</a></div></li>',
        '   <li class="about _online_"><span data-icon="messages"></span>' + document.webL10n.get('git-repository') + '<div><a href="' + document.webL10n.get('git-url') + '" target="_blank">url</a></div></li>',
        '   <li class="about _online_"><span data-icon="messages"></span>' + document.webL10n.get('settings-translations') + '<ul><a href="https://github.com/Sergio-Muriel" target="_blank">Sergio Muriel (es)</a><br><a href="https://github.com/evertton" target="_blank">Evertton de Lima (pt-BR)</a><br></ul></li>',
        '</ul>                                                                                                                                              ',
        '<h2 class="developper-menu">' + document.webL10n.get('settings-developper-menu') + '</h2>                                                          ',
        '<ul class="developper-menu">                                                                                                                       ',
        '   <li><span data-icon="wifi-4"></span>' + document.webL10n.get('settings-connection') + '<div id="onLine">NA</div></li>                           ',
        '   <li><span data-icon="play-circle"></span>' + document.webL10n.get('settings-use-animations') + '<div><label class="pack-switch"><input id="useAnimations" type="checkbox" ' + _useAnimations + '><span></span></label></div></li>',
        '   <li><span data-icon="sd-card"></span>' + document.webL10n.get('my-subscriptions') + '<div><button id="loadSubscriptions"><span data-l10n-id="load">load</span></button></div></li>',
        '   <li><span data-icon="sd-card"></span>' + document.webL10n.get('my-subscriptions') + '<div><button id="saveSubscriptions"><span data-l10n-id="save">save</span></button></div></li>',
        '   <li><span data-icon="bug"></span>Logs console<div><label class="pack-switch"><input id="logsConsole" type="checkbox" ' + _logsConsole + '><span></span></label></div></li>',
        '   <li><span data-icon="bug"></span>Logs screen<div><label class="pack-switch"><input id="logsScreen" type="checkbox" ' + _logsScreen + '><span></span></label></div></li>',
        '</ul>                                                                                                                                              '
        ].join('');

        ui.echo("settings", _htmlSettings, "");
        
        // =======================================
        // --- Hide / show The old reader form ---
        // =======================================
        
        params.accounts.theoldreader.logged ?
            document.getElementById('theoldreaderForm').style.cssText = 'display: none':
            document.getElementById('theoldreaderForm').style.cssText = 'display: block';
        
        // ============================
        // --- Show developper menu ---
        // ============================
        
        document.getElementById('appVersion').onclick = function(e) {
            params.settings.developper_menu.visible = !params.settings.developper_menu.visible;
            dspSettings();
            my.message('Developper menu : ' + params.settings.developper_menu.visible);
            _saveParams();
        }
        
        // ============================
        // --- Show developper menu ---
        // ============================

        if (params.settings.developper_menu.visible == true) {
            var dm = document.getElementsByClassName("developper-menu");
            var i;
            for (i = 0; i < dm.length; i++) {
                dm[i].style.display = "block";
            }
        }

        // ==================
        // --- Add Events ---
        // ==================

        document.getElementById('toggleDisplaySmallEntries').onclick = function(e) {
            document.body.dispatchEvent(new CustomEvent('settingsSmallNews.change', {"detail": ""}));
            params.entries.displaySmallEntries = !params.entries.displaySmallEntries;
            _saveParams();
            
            params.entries.displaySmallEntries ?
                ui._smallEntries('show') : ui._smallEntries('hide');
        }

        var _selectUpdateEvery = document.getElementById('selectUpdateEvery');
        _selectUpdateEvery.onchange = function(e) {
            params.entries.updateEvery = _selectUpdateEvery.options[_selectUpdateEvery.selectedIndex].value;
            _saveParams();
        }

        var _selectMaxNbDays = document.getElementById('selectMaxNbDays');
        _selectMaxNbDays.onchange = function(e) {
            params.entries.dontDisplayEntriesOlderThan = _selectMaxNbDays.options[_selectMaxNbDays.selectedIndex].value;
            
            if (params.entries.nbDaysAgo >= params.entries.dontDisplayEntriesOlderThan) {
                params.entries.nbDaysAgo = params.entries.dontDisplayEntriesOlderThan;
                ui._onclick(nextDay, 'enable');         // [<]
                ui._onclick(previousDay, 'disable');    // [>]
                feeds_entries.scrollTop = 0;
                dspEntries(gf.getEntries(), params.entries.nbDaysAgo, params.feeds.selectedFeed);
            }
            
            if (params.entries.nbDaysAgo < params.entries.dontDisplayEntriesOlderThan) {
                ui._onclick(previousDay, 'enable');     // [>]
            }
            
            _saveParams();
        }


        // UI vibrate

        document.getElementById("toggleVibrate").onclick = function() {
            params.settings.ui.vibrate = !params.settings.ui.vibrate;
            _saveParams();
        }
        
        // UI animations checkbox

        document.getElementById("useAnimations").onclick = function() {
            params.settings.ui.animations = !params.settings.ui.animations;
            _saveParams();
        }
        
        // Load subscriptions
        
        document.getElementById("loadSubscriptions").onclick = function(event) {
            if (window.confirm(document.webL10n.get('confirm-load-subscriptions'))) {
                my._load('subscriptions.local.json').then(
                    function (_mySubscriptions) {
                        try{
                            myFeedsSubscriptions['local'] = [];
                            addNewSubscriptions(_mySubscriptions);
                            my.message(document.webL10n.get('loading-subscriptions-done'));
                        } catch (err) {
                            my.alert(err.message);
                        }
                        gf.setFeedsSubscriptions(myFeedsSubscriptions);
                        gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
                    }
                ).catch(function(error) {
                    my.message(document.webL10n.get('error-cant-load-local-subscriptions') + JSON.stringify(error));
                });
            }
        }
        
        // Save subscriptions

        document.getElementById("saveSubscriptions").onclick = function(event) {
            if (window.confirm(document.webL10n.get('confirm-save-subscriptions'))) {
                _saveSubscriptions(true);
            }
        }
        
        // Logs console checkbox

        document.getElementById("logsConsole").onclick = function() {
            params.settings.developper_menu.logs.console = !params.settings.developper_menu.logs.console;
            _saveParams();
        }
        
        // Logs console screen

        document.getElementById("logsScreen").onclick = function() {
            params.settings.developper_menu.logs.screen = !params.settings.developper_menu.logs.screen;
            _saveParams();
        }

        // Feedly checkbox

        document.getElementById('feedlyLogin').onclick = function() {
            if (this.checked) {
                this.checked = false; // False until CustomEvent Feedly.login.done
                feedly.login();
            } else {
                params.accounts.feedly.logged = false;
                _disableAccount('feedly');
                gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
            }
        }

        // The Old Reader login checkbox

        document.getElementById('theoldreaderCheckbox').onclick = function() {
            if (this.checked) {
                this.checked = false; // False until CustomEvent TheOldReader.login.done
                var _email = document.getElementById("theoldreaderEmail").value;
                var _passwd = document.getElementById("theoldreaderPasswd").value;
                theoldreader.login(_email, _passwd);
            } else {
                params.accounts.theoldreader.logged = false;
                _disableAccount('theoldreader');
                gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
                document.getElementById('theoldreaderForm').style.cssText = 'display: block';
            }
        }
        
        // =========================
        // --- App start offline ---
        // =========================
        
        if (!navigator.onLine) {
            ui._disable();
        }

        // ---

        var end = performance.now();
        my.log("dspSettings() " + (end - start) + " milliseconds.");
    }

    function dspFeeds(feeds) {
        var start = performance.now();
        
        my.log('dspFeeds()', arguments);
        my.log(feeds.length + ' feeds');

        var _html = {
            'local': '',
            'feedly': '',
            'theoldreader': ''
        };
        var _htmlFeeds = "";
        var _htmlKeywords = '';
        var _feedlyAccessToken = feedly.getToken().access_token;
        var _theoldreaderAuth = theoldreader.getToken().Auth;

        // ========================
        // --- Display keywords ---
        // ========================
        
        if (keywords.length > 0) {
            var _sortedKeywords = keywords.sort();
            
            _htmlKeywords = _htmlKeywords + '<h2>' + document.webL10n.get('search-by-keywords') + '</h2><ul class="keywords">';
            
            for (var i = 0; i < _sortedKeywords.length; i++) {
                var _deleteIcone = '<button class="deleteKeyword" myKeyword="' + _sortedKeywords[i] + '"><span data-icon="delete"></span></button>';
                _htmlKeywords = _htmlKeywords + '<li><a class="openKeyword" myKeyword="' +  _sortedKeywords[i] + '"><p>' + _deleteIcone + '<button><span data-icon="search"></span></button>' + _sortedKeywords[i] + '</p></a></li>';
            }
            
            _htmlKeywords = _htmlKeywords + '</ul>';
        }
        
        // ==========================
        // --- Display feeds list ---
        // ==========================

        for (var i = 0; i < feeds.length; i++) {
            var _feed = feeds[i];
            var _account = _feed._myAccount;
            var _deleteIcone = '';

            if ((_account == 'local') ||
                ((_account == 'feedly') && (_feedlyAccessToken !== undefined)) ||
                ((_account == 'theoldreader') && (_theoldreaderAuth !== undefined))
            ){
                var _class = (_account == 'local') ? "delete" : "delete _online_";
                    
                _deleteIcone = '<button class="' + _class + '" account="' + _account + '" feedId="' + _feed._myFeedId + '"><span data-icon="delete"></span></button>';
            }

            _html[_account] = _html[_account] + '<li><a class="open" feedUrl="' + _feed.feedUrl + '"><p>' + _deleteIcone + '<button><span data-icon="' + _feed._myPulsationsIcone + '"></span></button>' + _feed.title + '</p><p><time>' + _feed._myLastPublishedDate + '</time></p></a></li>';
        }

        _htmlFeeds = _htmlFeeds +
            '<ul>' +
            '<li><a class="open" feedUrl=""><p><button><span data-icon="forward"></span></button>' + document.webL10n.get('all-feeds') + '</p></a></li>' +
            '</ul>' +
            '' + _htmlKeywords;
        
        for (var _account in _html) {
            if (_html[_account] != "") {
                _htmlFeeds = _htmlFeeds + '<h2>' + params.accounts[_account].title + '</h2><ul class="' + _account + '">' + _html[_account] + '</ul>';
            }
        }
        
        // --- Display ---

        ui.echo("feeds-list", _htmlFeeds, "");
        
        // ===========================
        // --- Add Events keywords ---
        // ===========================
        
        // onclick delete keyword :

        var _deletes = document.querySelectorAll(".deleteKeyword");

        for (var i = 0; i < _deletes.length; i++) {
            _deletes[i].onclick = function(e) {
                ui._vibrate();
                e.stopPropagation();
                e.preventDefault();
                deleteKeyword(this);
            }
        }
        
        // onclick open keyword :

        var _opens = document.querySelectorAll(".openKeyword");

        for (var i = 0; i < _opens.length; i++) {
            _opens[i].onclick = function() {
                liveValues['entries']['search']['visible'] = true;
                ui._vibrate();
                ui._scrollTo(2);
                ui._onclick(nextDay, 'disable');
                ui._onclick(previousDay, 'enable');
                params.entries.nbDaysAgo = 0;
                params.feeds.selectedFeed = "";
                document.getElementById('inputSearchEntries').value = this.getAttribute("myKeyword");
                dspEntries(gf.getEntries(), params.entries.nbDaysAgo, params.feeds.selectedFeed);
            }
        }

        // ========================
        // --- Add Events Feeds ---
        // ========================

        // onclick delete button :

        var _deletes = document.querySelectorAll(".delete");

        for (var i = 0; i < _deletes.length; i++) {
            _deletes[i].onclick = function(e) {
                ui._vibrate();
                e.stopPropagation();
                e.preventDefault();
                deleteFeed(this);
            }
        }

        // onclick open feed :

        var _opens = document.querySelectorAll(".open");

        for (var i = 0; i < _opens.length; i++) {
            _opens[i].onclick = function() {
                liveValues['entries']['search']['visible'] = false;
                document.getElementById('inputSearchEntries').value = "";
                ui._vibrate();
                ui._scrollTo(2);
                ui._onclick(nextDay, 'disable');
                ui._onclick(previousDay, 'enable');
                params.entries.nbDaysAgo = 0;
                params.feeds.selectedFeed = this.getAttribute("feedUrl");
                _saveParams();
                dspEntries(gf.getEntries(), params.entries.nbDaysAgo, params.feeds.selectedFeed);
            }
        }
        
        // =========================
        // --- App start offline ---
        // =========================

        if (!navigator.onLine) {
            ui._disable();
        }
        
        var end = performance.now();
        my.log("dspFeeds() " + (end - start) + " milliseconds.");
    }

    function dspEntries(entries, nbDaysAgo, feedUrl) {

        var feedsEntriesScrollTop = feeds_entries.scrollTop;
        
        ui.echo('feedsEntriesNbDaysAgo', document.webL10n.get('loading'), '');
        ui.echo('feeds-entries', '', '');
        
        clearTimeout(_dspEntriesTimeout);
        
        _dspEntriesTimeout = window.setTimeout(function() {

            var start = performance.now();
            
            my.log("dspEntries()", arguments);
            my.log(entries);

            sortedEntries = entries;

            _setTimestamps();

            var _timestampMin = liveValues['timestamps']['max'] - (86400 * nbDaysAgo) - 86400 + 1;
            var _timestampMax = liveValues['timestamps']['max'] - (86400 * nbDaysAgo);
            
            my.log("dspEntries() beetween " + _timestampMin + " (00:00:00) & " + _timestampMax + " (23:59:59)");

            var _previousDaysAgo    = -1; // Count days to groups entries by day.
            var _entrieNbDaysAgo    = 0;

            var _nbEntriesDisplayed = {'small': 0, 'large': 0};

            // =======================
            // --- Display entries ---
            // =======================

            var _htmlEntries = "";
            var _htmlFeedTitle = "";
            var _firstEntrie = true;
            var _theme = params.entries.theme;
            
            var _nb = sortedEntries.length;

            for (var i = 0; i < _nb; i++) {

                // Get entries of specific feed or get all entries.

                var _entrie = "";

                if ((feedUrl !== "") && (feedUrl == sortedEntries[i]._myFeedInformations.feedUrl)) {
                    var _entrie = sortedEntries[i];
                    if (_firstEntrie) {
                        _htmlFeedTitle = _htmlFeedTitle + '<h2>' + _entrie._myFeedInformations.title + '</h2>'; // Specific feed title
                        _firstEntrie = false;
                    }
                } else if (feedUrl == "") {
                    var _entrie = sortedEntries[i];
                }

                // ---

                if ((_entrie._myTimestamp >= _timestampMin) && (_entrie._myTimestamp < _timestampMax)) {

                        // Time
                        
                        var _time = _entrie._myLocalizedTime;

                        // Small article or not ?

                        var _isSmallEntry = isSmallEntry(_entrie);

                        // 1st image

                        var _imageUrl = "";
                        
                        // Try to detect broken image
                        /*var _img = new Image(); 
                        _img.src = _entrie._myFirstImageUrl; 

                        if (!_img.complete) {
                            _entrie._myFirstImageUrl = "";
                        }*/

                        if (_entrie._myFirstImageUrl) {
                            if (_isSmallEntry) {
                                _imageUrl = '<span class="my-'+_theme+'-image-container '+_theme+'-ratio-image-s"><img src="images/loading.png" data-src="' + _entrie._myFirstImageUrl + '"/></span>';
                            } else {
                                _imageUrl = '<span class="my-'+_theme+'-image-container '+_theme+'-ratio-image-l"><img src="images/loading.png" data-src="' + _entrie._myFirstImageUrl + '"/></span>';
                            }
                        }

                        // Entry class ratio ?

                        var _ratioClass = _theme + '-ratio-entry-l';

                        if (_isSmallEntry && (!_entrie._myFirstImageUrl)) {
                            _ratioClass = _theme + '-ratio-entry-s';
                        }

                        else if (_isSmallEntry || (!_entrie._myFirstImageUrl)) {
                            _ratioClass = _theme + '-ratio-entry-m';
                        }

                        // Account icone ?

                        var _accountIcone = '';

                        if (_entrie._myFeedInformations._myAccount != 'local') {
                            _accountIcone = '<img src="images/' + _entrie._myFeedInformations._myAccount + '.' + _theme + '.png" data-src="images/' + _entrie._myFeedInformations._myAccount + '.' + _theme + '.png" />';
                        }

                        // Content ( Normal / Small )

                        var _content = "";

                        if ((params.entries.theme == 'list') && (!_isSmallEntry)) {
                            _content = _content + '<div class="my-'+_theme+'-entry-l ' + _ratioClass + '" i="' + i + '">';
                            _content = _content + '<span class="my-'+_theme+'-feed-title">' + _entrie._myFeedInformations.title + '</span>';
                            _content = _content + '<span class="my-'+_theme+'-date" publishedDate="' + _entrie.publishedDate + '">' + _time + '</span>';
                            _content = _content + '<div class="my-'+_theme+'-image-wrapper">' + _imageUrl + '</div>';
                            _content = _content + '<span class="my-'+_theme+'-title">' + _accountIcone + _entrie.title + '</span>';
                            _content = _content + '<span class="my-'+_theme+'-snippet">' + _entrie.contentSnippet + '</span>';
                            _content = _content + '<div class="my-'+_theme+'-footer"></div>';
                            _content = _content + '</div>';

                            _nbEntriesDisplayed['large']++;

                        } else if (params.entries.theme == 'list') {
                            _content = _content + '<div class="_online_ _small_ my-'+_theme+'-entry-s ' + _ratioClass + '" i="' + i + '" entry_link="' + _entrie.link + '">';
                            _content = _content + '<span class="my-'+_theme+'-feed-title">' + _entrie._myFeedInformations.title + '</span>';
                            _content = _content + '<span class="my-'+_theme+'-date" publishedDate="' + _entrie.publishedDate + '">' + _time + '</span>';
                            _content = _content + '<div class="my-'+_theme+'-image-wrapper">' + _imageUrl + '</div>';
                            _content = _content + '<span class="my-'+_theme+'-title">' + _accountIcone + _entrie.title + '</span>';
                            _content = _content + '<span class="my-'+_theme+'-snippet">' + _entrie.contentSnippet + '</span>';
                            _content = _content + '<div class="my-'+_theme+'-footer"></div>';
                            _content = _content + '</div>';

                            _nbEntriesDisplayed['small']++;

                        } else if (!_isSmallEntry) {
                            _content = _content + '<div class="my-'+_theme+'-entry-l ' + _ratioClass + '" i="' + i + '">';
                            _content = _content + '<span class="my-'+_theme+'-title">' + _accountIcone + _entrie.title + '</span>';
                            _content = _content + '<span class="my-'+_theme+'-feed-title">' + _entrie._myFeedInformations.title + '</span>';
                            _content = _content + _imageUrl;
                            _content = _content + '<span class="my-'+_theme+'-date" publishedDate="' + _entrie.publishedDate + '">' + _time + '</span>';
                            _content = _content + '<span class="my-'+_theme+'-snippet">' + _entrie.contentSnippet + '</span>';
                            _content = _content + '</div>';

                            _nbEntriesDisplayed['large']++;

                        } else {
                            _content = _content + '<div class="_online_ _small_ my-'+_theme+'-entry-s ' + _ratioClass + '" i="' + i + '" entry_link="' + _entrie.link + '">';
                            _content = _content + '<span class="my-'+_theme+'-title">' + _accountIcone + _entrie.title + '</span>';
                            _content = _content + '<span class="my-'+_theme+'-feed-title">' + _entrie._myFeedInformations.title + '</span>';
                            _content = _content + _imageUrl;
                            _content = _content + '<span class="my-'+_theme+'-date" publishedDate="' + _entrie.publishedDate + '">' + _time + '</span>';
                            _content = _content + '</div>';

                            _nbEntriesDisplayed['small']++;
                        }

                        // Add to html entries

                        _htmlEntries = _htmlEntries + _content;

                } else if ((_nbEntriesDisplayed['small'] + _nbEntriesDisplayed['large']) > 0) { break; }
            }

            // --- Display Today / Yesterday / Nb days ago ---

            if (nbDaysAgo == 0) {
                _daySeparator = document.webL10n.get('nb-days-ago-today');
            } else if (nbDaysAgo == 1) {
                _daySeparator = document.webL10n.get('nb-days-ago-yesterday');
            } else {
                _daySeparator = myExtraTranslations['nb-days-ago'].replace('{{n}}', nbDaysAgo);
            }

            ui.echo('feedsEntriesNbDaysAgo', _daySeparator, '');

            // Display entries:
            
            if (params.entries.displaySmallEntries && ((_nbEntriesDisplayed['small'] + _nbEntriesDisplayed['large']) > 0)) {
                ui.echo("feeds-entries", _htmlFeedTitle + _htmlEntries, "");
            } else if (!params.entries.displaySmallEntries && (_nbEntriesDisplayed['large'] > 0)) {
                ui.echo("feeds-entries", _htmlFeedTitle + _htmlEntries, "");
            } else if (!params.entries.displaySmallEntries && (_nbEntriesDisplayed['large'] == 0)) {
                ui.echo("feeds-entries", _htmlFeedTitle + '<div class="notification">' + document.webL10n.get('no-news-today') + '</div>', "");
            } else if ((_nbEntriesDisplayed['small'] + _nbEntriesDisplayed['large']) == 0) {
                ui.echo("feeds-entries", _htmlFeedTitle + '<div class="notification">' + document.webL10n.get('no-news-today') + '</div>', "");
            } else {
                ui.echo("feeds-entries", _htmlFeedTitle + '<div class="notification">' + document.webL10n.get('error-no-network-connection') + '</div>', "");
            } 
            
            // Hide/show small entries:
            
            params.entries.displaySmallEntries ?
                ui._smallEntries('show') : ui._smallEntries('hide');

            // Scroll if you stay in same day.
            
            if (_previousNbDaysAgo == nbDaysAgo) {
                feeds_entries.scrollTop = feedsEntriesScrollTop;
            }
            
            _previousNbDaysAgo = nbDaysAgo;
            
            // ==================
            // --- Add Events ---
            // ==================

            // onclick Small Entries:

            var _small_entries = document.querySelectorAll(".my-"+_theme+"-entry-s");
            
            _nb = _small_entries.length;

            for (var i = 0; i < _nb; i++) {
                _small_entries[i].onclick = function() {
                    ui._vibrate(); 
                    ui.fade(this); 
                    mainEntryOpenInBrowser(this.getAttribute("i"), this.getAttribute("entry_link")); 
                }
            }

            // onclick Normal Entries :

            var _entries = document.querySelectorAll(".my-"+_theme+"-entry-l");

            _nb = _entries.length;

            for (var i = 0; i < _nb; i++) {
                _entries[i].onclick = function() { 
                    ui._vibrate(); 
                    ui.fade(this); 
                    mainEntryOpenInBrowser(this.getAttribute("i"), ""); 
                }
            }
            
            // =========================
            // --- App start offline ---
            // =========================
            
            if (!navigator.onLine) {
                ui._disable();
            }
            
            document.body.dispatchEvent(new CustomEvent('dspEntries.done', {"detail": ""}));
        
            // --- Eecution time
            
            var end = performance.now();
            my.log("dspEntries() " + (end - start) + " milliseconds.");
        
        }, 250); // Schedule the execution for later
    }
    
    /**
     * Is it a small entry ?
     * @param {object} entry
     * @return {boolean} true, false
     * */
    function isSmallEntry(entry) {
        var _out;
        var _diff = entry.content.length - entry.contentSnippet.length;
        
        if (_diff < params.entries.maxLengthForSmallEntries) {
            _out = true;
        } else {
            _out = false;
        }
        
        return _out;
    }
    
    /**
     * Set id max for entries. Variable "liveValues['entries']['id']['max']"
     * Set id min for entries. Variable "liveValues['entries']['id']['min']"
     * 
     * News ID outside this range can't be displayed.
     * 
     * Depends of settings...
     * - params.entries.dontDisplayEntriesOlderThan
     * - isSmallEntry()
     * - search keyword value
     * 
     * @param {null}
     * @return {null}
     * */
    function setEntriesIds() {
        my.log('setEntriesIds()');

        // ID max
        
        _setTimestamps();

        var _nb     = sortedEntries.length - 1;
        var _string = document.getElementById('inputSearchEntries').value || "";

        while ((sortedEntries[_nb]._myTimestamp < liveValues['timestamps']['min'])
            || (!params.entries.displaySmallEntries && isSmallEntry(sortedEntries[_nb]))
            || (_string !== "" && liveValues['entries']['search']['visible'] && (((JSON.stringify(sortedEntries[_nb])).toLowerCase()).indexOf(_string.toLowerCase()) == -1))
        ){
            _nb = _nb - 1;
            if (_nb < 0) { break; }
        }
        
        my.log('setEntriesIds() entries = ', sortedEntries);
        my.log('setEntriesIds() search = ' + _string);
        my.log('setEntriesIds() result = ', sortedEntries[_nb]);
        
        liveValues['entries']['id']['max'] = _nb;
        
        // ID min

        my.log('setEntriesIds()');
        
        var _nb     = 0;
        var _string = document.getElementById('inputSearchEntries').value || "";

        while ((sortedEntries[_nb]._myTimestamp > liveValues['timestamps']['max'])
            || ((params.entries.displaySmallEntries == false) && (isSmallEntry(sortedEntries[_nb]) == true)) 
            || (_string !== "" && liveValues['entries']['search']['visible'] && (((JSON.stringify(sortedEntries[_nb])).toLowerCase()).indexOf(_string.toLowerCase()) == -1))
        ){
            _nb = _nb + 1;
            if (_nb >= sortedEntries.length) { break; }
        }
        
        my.log('setEntriesIds() entries = ', sortedEntries);
        my.log('setEntriesIds() search = ' + _string);
        my.log('setEntriesIds() result = ', sortedEntries[_nb]);
        
        liveValues['entries']['id']['min'] = _nb;
    }

    function mainEntryOpenInBrowser(entryId, url) {
        my.log('mainEntryOpenInBrowser()', arguments);
        document.body.style.cssText = "overflow: hidden;";  // Disable scroll in entries list.
        
        share.setAttribute("_mySha256_link", sortedEntries[entryId]['_mySha256_link']);
        share.setAttribute("_mySha256_title", sortedEntries[entryId]['_mySha256_title']);

        if (url != "" ) {
            ui.echo("browser", '<iframe src="' + url + '" sandbox="allow-same-origin allow-scripts" mozbrowser remote></iframe>', "");
        } else {
            var _entry = sortedEntries[entryId];
            var _srcDoc = "";
            var _regex = new RegExp('\'', 'g');
            var _author = "";
            
            //my.log('mainEntryOpenInBrowser()', _entry.content);

            if (_entry.author !== "") {
                _author = '<div class="entrie-author">' + myExtraTranslations['by'] + ' ' + _entry.author + '</div>';
            }

            _srcDoc = _srcDoc + _srcDocCss; // Inline CSS from file "style/inline.css.js"
            _srcDoc = _srcDoc + '<div class="entrie-title">' + _entry.title.replace(_regex, "&#39;") + '</div>';
            _srcDoc = _srcDoc + '<div class="entrie-date">' + new Date(_entry.publishedDate).toLocaleString() + '</div>';
            _srcDoc = _srcDoc + _author;
            _srcDoc = _srcDoc + '<div class="entrie-feed-title"><a href="' + _entry._myFeedInformations.link + '">' + _entry._myFeedInformations.title.replace(_regex, "&#39;") + '</a></div>';
            _srcDoc = _srcDoc + '<div class="entrie-contentSnippet">' + _entry.content.replace(_regex, "&#39;") + '</div>';
            _srcDoc = _srcDoc + '<div class="entrie-visit-website"><a href="' + _entry.link + '">' + document.webL10n.get('entry-visit-website') + '</a></div>';

            ui.echo("browser", '<iframe srcdoc=\'' + _srcDoc + '\' sandbox="allow-same-origin allow-scripts" mozbrowser remote></iframe>', "");
        }

        document.getElementById("browser").style.cssText = "display: block;";

        main_entry.scrollTop = 0;
        
        document.body.dispatchEvent(new CustomEvent('mainEntryOpen.done', {"detail": {"entryId": entryId, "url": url, "_mySha256_link": sortedEntries[entryId]['_mySha256_link'], "_mySha256_title": sortedEntries[entryId]['_mySha256_title']}}));

        ui._quickScrollTo(4);
    }

    /**
     * @param {null}
     * Update feeds pulsations once all feeds are loaded.
     * */
    function updateFeedsPulsations() {
        var _tmp = [];
        var _feeds = gf.getFeeds();
        var _pulsations;
        var _feed = '';

        for (var _account in myFeedsSubscriptions) {

            for (var i = 0 ; i < myFeedsSubscriptions[_account].length; i++) {

                for (var j = 0 ; j < _feeds.length; j++) {

                    if (myFeedsSubscriptions[_account][i].url == _feeds[j].feedUrl) {

                        _url        = _feeds[j].feedUrl;
                        _pulsations = _feeds[j]._myPulsations;
                        _account    = _feeds[j]._myAccount; // test

                        if (isNaN(_pulsations)) {
                            // do nothing
                        } else {
                            myFeedsSubscriptions[_account][i].pulsations = _pulsations;
                        }

                        break;
                    }
                }
            }
        }
    }

    /**
     * Set timestamps values Min & Max.
     * Variable "liveValues['timestamps']['max']" Start of day timestamp. 
     * Variable "liveValues['timestamps']['min']" Value beyond which an entry can't be displayed. (Too old)
     * @param {null}
     * */
    function _setTimestamps() {
        var _now    = new Date();
        var _year   = _now.getFullYear();
        var _month  = _now.getMonth();
        var _day    = _now.getDate();

        var _myDate = new Date(_year, _month, _day, '23','59','59');
        
        liveValues['timestamps']['max'] = Math.floor(_myDate.getTime() / 1000);

        liveValues['timestamps']['min'] = liveValues['timestamps']['max'] - (86400 * params.entries.dontDisplayEntriesOlderThan) - 86400 + 1;
    }

    // Callback for ALL subscriptions promises
    // 1st feeds loading.

    function initAndLoadFeeds(subscriptions) {
        my.log('initAndLoadFeeds()', arguments);

        // Add feeds from subscription(s) file(s)
        // subscriptions.local.json
        // subscriptions.feedly.json
        // subscriptions.theoldreader.json
        // ...

        for (var i = 0; i < subscriptions.length; i++) {
            for (var j = 0; j < subscriptions[i].length; j++) {
                my.log('initAndLoadFeeds()', subscriptions[i][j]);
                var _account = subscriptions[i][j].account;
                if (myFeedsSubscriptions[_account] === undefined) {
                    myFeedsSubscriptions[_account] = [];
                }
                if (_account == "local" || params.accounts[_account].logged) {
                    myFeedsSubscriptions[_account].push(subscriptions[i][j]);
                }
            }
        }

        // No feeds sets.
        // Use default feeds ?

        var _nbFeedsSubscriptions = 0;

        for (var _account in myFeedsSubscriptions) {
            _nbFeedsSubscriptions = _nbFeedsSubscriptions + myFeedsSubscriptions[_account].length;
        }

        if (_nbFeedsSubscriptions == 0) {
            var _confirm = window.confirm(document.webL10n.get('confirm-use-default-feeds'));
            if (_confirm) {
                var _populateMySubscriptions = [
                    {"url": "https://www.reddit.com/r/FireFoxOS/.rss",          "pulsations": 2,    "account": "local", "id": "https://www.reddit.com/r/FireFoxOS/.rss"},
                    {"url": "http://www.webupd8.org/feeds/posts/default",       "pulsations": 2,    "account": "local", "id": "http://www.webupd8.org/feeds/posts/default"},
                    {"url": "http://metro.co.uk/sport/football/feed/",          "pulsations": 5,    "account": "local", "id": "http://metro.co.uk/sport/football/feed/"},
                    {"url": "http://sourceforge.net/blog/feed/",                "pulsations": 2,    "account": "local", "id": "http://sourceforge.net/blog/feed/"},
                    {"url": "http://www.gorillavsbear.net/category/mp3/feed/",  "pulsations": 2,    "account": "local", "id": "http://www.gorillavsbear.net/category/mp3/feed/"},
                    {"url": "http://www.wired.com/feed/",                       "pulsations": 5,    "account": "local", "id": "http://www.wired.com/feed/"}
                ];

                for (var i = 0; i < _populateMySubscriptions.length; i++) {
                    myFeedsSubscriptions.local.push(_populateMySubscriptions[i]);
                    _nbFeedsSubscriptions++;
                }

                my._save("subscriptions.local.json", "application/json", JSON.stringify(myFeedsSubscriptions.local)).then(function(results) {
                    my.log('Save file subscriptions.local.json');
                }).catch(function(error) {
                    my.error("ERROR saving file ", error);
                    my.alert("ERROR saving file " + error.filename);
                });
            }
        }

        // 1st feeds loading

        my.log('========================');
        my.log(myFeedsSubscriptions);
        my.log('========================');

        if (_nbFeedsSubscriptions > 0) {
            gf.setFeedsSubscriptions(myFeedsSubscriptions);
            gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
        }

        // ---

        dspSettings();
    }

    function _saveParams() {
        var _nbDaysAgo = params.entries.nbDaysAgo;
        params.entries.nbDaysAgo = 0;   // Reset nbDaysAgo value before saving file.
                                        // Reset affect "params" object !!!!!
        my._save("params.json", "application/json", JSON.stringify(params)).then(function(results) {
            my.log("Save file params.json");
        }).catch(function(error) {
            my.error("ERROR saving file params.json", error);
            my.alert('ERROR saving file params.json');
        });
        params.entries.nbDaysAgo = _nbDaysAgo;
    }
    
    function _saveKeywords() {
        my._save("keywords.json", "application/json", JSON.stringify(keywords)).then(function(results) {
            my.log("Save file keywords.json");
        }).catch(function(error) {
            my.error("ERROR saving file keywords.json", error);
            my.alert('ERROR saving file keywords.json');
        });
    }
    
    /**
     * Disable online account
     * @param {string} feedly, theoldreader
     * */
    function _disableAccount(_account) {
        my.log('_disableAccount', arguments);
        params.accounts[_account].logged = false
        myFeedsSubscriptions[_account] = [];
        gf.setFeedsSubscriptions(myFeedsSubscriptions);
        gf.deleteEntries(_account, '');
        _saveParams();
     }

    /**
     * Add new feeds in array myFeedsSubscriptions
     * if feeds doesn't exists in array.
     * @param {_feeds} array
     * */
    function addNewSubscriptions(_feeds) {
        var start = performance.now();
        
        my.log('addNewSubscriptions()', arguments);
        for (var i = 0; i < _feeds.length; i++) {
            _addNewSubscription(_feeds[i]);
        }
        
        var end = performance.now();
        my.log("addNewSubscriptions() " + (end - start) + " milliseconds.");
    }

    function _addNewSubscription(_feed) {
        my.log('_addNewSubscription()', arguments);

        var _insertNewFeed = true;
        var _account = _feed.account;

        if (myFeedsSubscriptions[_account] === undefined) {
            myFeedsSubscriptions[_account] = [];
        }

        var i = myFeedsSubscriptions[_account].length;
        while (i--) {
            if (myFeedsSubscriptions[_account][i].id === _feed.id) {
                _insertNewFeed = false;
                break;
            }
        }

        if (_insertNewFeed) {
            myFeedsSubscriptions[_account].push(_feed);
        }
    }
    
    /**
     * Localize times who are visibles in viewport
     * */
    function localizeTimes() {
        var className = 'my-'+params.entries.theme+'-date';
        var elements = document.getElementsByClassName(className);
        for (var i = 0; i < elements.length; i++) {
            if (isInViewport(elements[i]) && (elements[i].textContent == "")) {
                var _publishedDate = elements[i].getAttribute('publishedDate');
                elements[i].textContent = new Date(_publishedDate).toLocaleTimeString(userLocale);
            }
        }
    }
    
    /**
     * Load images who are visibles in viewport
     * */
    function loadImages() {
        var images = document.getElementsByTagName('img');
        for (var i = 0; i < images.length; i++) {
            if (isInViewport(images[i]) 
                && (images[i].getAttribute('data-src') != "")
                && (images[i].getAttribute('src') == "")
            ){
                images[i].setAttribute('src', images[i].getAttribute('data-src'));
            }
        }
    }
    
    /**
     * Check if element is visible in viewport
     * @param {object} elem DOM element
     * @return {boolean} true / false
     * */
    function isInViewport(element) {
        var rect = element.getBoundingClientRect()
        var windowHeight = window.innerHeight || document.documentElement.clientHeight
        var windowWidth = window.innerWidth || document.documentElement.clientWidth

        return rect.bottom > 0 && rect.top < windowHeight && rect.right > 0 && rect.left < windowWidth
    }

    // ======================
    // --- Ready to start ---
    // ======================

    window.onload = function () {
        
        _swipe("");

        // Promises V1

        var promise1 = my._load('subscriptions.local.json').then(function(results) {return results;}
        ).catch(function(error) {_disableAccount('local'); return {};});

        var promise2 = my._load('subscriptions.feedly.json').then(function(results) {return results;}
        ).catch(function(error) {_disableAccount('feedly'); return {};});

        var promise3 = my._load('subscriptions.theoldreader.json').then(function(results) {return results;}
        ).catch(function(error) {_disableAccount('theoldreader'); return {};});

        var arrayPromises = [promise1, promise2, promise3];

        Promise.all(arrayPromises).then(function(arrayOfResults) {
            initAndLoadFeeds(arrayOfResults);
        }).catch(function(error) {
            my.alert('KO all promises', error.message);
        });

        // Promises V2
        /*var arrayPromises = [];
        var i = 0;

        for (var _account in myFeedsSubscriptions) {
            arrayPromises[i] = my._load('subscriptions.' + _account + '.json').then(function(results) {return results;}
            ).catch(function(error) {params.accounts[_account].logged = false; _saveParams(); return {};});
            i++;
        }

        Promise.all(arrayPromises).then(function(arrayOfResults) {
            initAndLoadFeeds(arrayOfResults);
        }).catch(function(error) {
            my.alert('KO all promises', error.message);
        });*/

        // =================================
        // --- Button load subscriptions ---
        // =================================
        // Disable button if subscriptions file doesn't exists.

        my._file_exists('subscriptions.local.json', function(exists){
            if (!exists) {
                ui._onclick(loadSubscriptions, 'disable');
            }
        });

        // ===============================================
        // --- Network connection : online / offline ? ---
        // ===============================================

        setInterval(function() {
            if (_onLine != navigator.onLine) {
                var _status = navigator.onLine == true ? 'enable' : 'disable';

                document.body.dispatchEvent(new CustomEvent('networkConnection.change', {"detail": _onLine}));

                ui.toggle(_status);

                // Store current connection status

                _onLine = navigator.onLine;

                // ---
            }
        }, 5000);
        
        // ======================
        // --- Memory cleanup ---
        // ======================
        
        // Remove old entries
        
        setInterval(function() {
            var _maxNbDaysAgo = params.settings.days.last();
            var _timestampMax = liveValues['timestamps']['max'] - (86400 * _maxNbDaysAgo);
            gf.deleteOldEntries(_timestampMax);
        }, 60000);
        
        // ============================
        // --- Load visibles images ---
        // ============================
        
        setInterval(function() {
            loadImages();
        }, 200);
        
        // ======================
        // --- Localize times ---
        // ======================
        
        setInterval(function() {
            localizeTimes();
        }, 500);

        // ==============
        // --- Events ---
        // ==============

        browser.addEventListener('mozbrowsererror', function (event) {
            console.dir("Moz Browser loading error : " + event.detail);
        });
        
        // Keyboard
        
        window.addEventListener("keydown", function (event) {
            if (event.keyCode == 13) {
                if (document.activeElement.id == "inputSearchEntries") {
                    event.stopPropagation();
                    event.preventDefault();
                    document.getElementById('inputSearchEntries').blur(); // Remove focus
                    _search(document.activeElement.value);
                }
            }
        }, true);

        // Automatic update entries every N seconds :

        var _startInterval = performance.now();
        
        _entriesUpdateInterval = window.setInterval(function() {
            var _nowInterval = performance.now();
            if (navigator.onLine && ((_nowInterval - _startInterval) >= (params.entries.updateEvery * 1000))) {
                _startInterval = _nowInterval;
                ui._onclick(sync, 'disable');
                gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
            }
        }, 59000); // 59s Less than minimal Firefox OS sleep time (60s)
        
        // Main entry open done...
        // Update next entry [<] & previous entry [>] buttons.
        
        document.body.addEventListener('mainEntryOpen.done', function(event){
            
            setEntriesIds(); // Set values liveValues['entries']['id']['max'] & liveValues['entries']['id']['min']
            
            var _entryId = 0;
            var _mySha256_title = event.detail["_mySha256_title"];
            var _mySha256_link  = event.detail["_mySha256_link"];
            var _nb = sortedEntries.length;
            var _string = document.getElementById('inputSearchEntries').value || "";

            for (var i = 0; i < _nb; i++) {
                if ((sortedEntries[i]['_mySha256_title']== _mySha256_title) ||
                    (sortedEntries[i]['_mySha256_link'] == _mySha256_link)) {

                    var _entryId = i;
                    var _previousEntryId = i + 1;
                    var _nextEntryId = i - 1;

                    // [>] previous news ?
                    
                    if (_previousEntryId > liveValues['entries']['id']['max']) {
                        _previousEntryId = _entryId;
                    } else {
                        var _content = (sortedEntries[_previousEntryId]._myFeedInformations.title + ' ' + sortedEntries[_previousEntryId].title + ' ' + sortedEntries[_previousEntryId].contentSnippet).toLowerCase();
                        
                        while ((sortedEntries[_previousEntryId]._myTimestamp < liveValues['timestamps']['min'])
                            || (!params.entries.displaySmallEntries && isSmallEntry(sortedEntries[_previousEntryId]))
                            || (_string !== "" && liveValues['entries']['search']['visible'] && (_content.indexOf(_string.toLowerCase()) == -1))
                        ){
                            _previousEntryId = _previousEntryId + 1;
                            if (_previousEntryId > liveValues['entries']['id']['max']) { _previousEntryId = _entryId; break; }
                            _content = (sortedEntries[_previousEntryId]._myFeedInformations.title + ' ' + sortedEntries[_previousEntryId].title + ' ' + sortedEntries[_previousEntryId].contentSnippet).toLowerCase();
                        }
                    }
                
                    // [<] next news ?
                    
                    if (_nextEntryId < 0) {
                        _nextEntryId = _entryId; 
                    } else {
                        var _content = (sortedEntries[_nextEntryId]._myFeedInformations.title + ' ' + sortedEntries[_nextEntryId].title + ' ' + sortedEntries[_nextEntryId].contentSnippet).toLowerCase();
                        
                        while ((sortedEntries[_nextEntryId]._myTimestamp > liveValues['timestamps']['max'])
                            || (!params.entries.displaySmallEntries && isSmallEntry(sortedEntries[_nextEntryId]))
                            || (_string !== "" && liveValues['entries']['search']['visible'] && (_content.indexOf(_string.toLowerCase()) == -1))
                        ){
                            _nextEntryId = _nextEntryId - 1;
                            if (_nextEntryId < 0) {_nextEntryId = _entryId; break; }
                            _content = (sortedEntries[_nextEntryId]._myFeedInformations.title + ' ' + sortedEntries[_nextEntryId].title + ' ' + sortedEntries[_nextEntryId].contentSnippet).toLowerCase();
                        }
                    }
                    
                    break;
                }
            }
            
            //my.message(_nextEntryId+ ' [<] '+ _entryId +' [>]' +_previousEntryId);

            // [<]
            
            if (isSmallEntry(sortedEntries[_nextEntryId])) {
                dom['entry']['next'].setAttribute("i", _nextEntryId);
                dom['entry']['next'].setAttribute("entry_link", sortedEntries[_nextEntryId].link);
            } else {
                dom['entry']['next'].setAttribute("i", _nextEntryId);
                dom['entry']['next'].setAttribute("entry_link", "");
            }
            
            // [>]
            
            if (isSmallEntry(sortedEntries[_previousEntryId])) {
                dom['entry']['previous'].setAttribute("i", _previousEntryId);
                dom['entry']['previous'].setAttribute("entry_link", sortedEntries[_previousEntryId].link);
            } else {
                dom['entry']['previous'].setAttribute("i", _previousEntryId);
                dom['entry']['previous'].setAttribute("entry_link", "");
            }
            
            // Disable / enable button [<]
            
            if ((_nextEntryId < liveValues['entries']['id']['min']) || (_nextEntryId == _entryId)) {
                ui._onclick(dom['entry']['next'], 'disable');
            } else {
                ui._onclick(dom['entry']['next'], 'enable');
            }
            
            // Disable / enable button [>]
            
            if ((_previousEntryId > liveValues['entries']['id']['max']) || (_previousEntryId == _entryId)) {
                ui._onclick(dom.entry['previous'], 'disable');
            } else {
                ui._onclick(dom.entry['previous'], 'enable');
            }
            
        });
        
        // ---
        
        dom['entry']['next'].onclick = function() {
            mainEntryOpenInBrowser(this.getAttribute("i"), this.getAttribute("entry_link")); 
        }
        
        dom['entry']['previous'].onclick = function() {
            mainEntryOpenInBrowser(this.getAttribute("i"), this.getAttribute("entry_link")); 
        }
        
        // Share entry :
        // https://developer.mozilla.org/fr/docs/Web/API/Web_Activities

        share.onclick = function() {
            my.log(this);
            ui._vibrate();
            var _entryId = 0;
            var _mySha256_title = this.getAttribute("_mySha256_title");
            var _mySha256_link  = this.getAttribute("_mySha256_link");
            
            for (var i = 0; i < sortedEntries.length; i++) {
                if ((sortedEntries[i]['_mySha256_title']== _mySha256_title) ||
                    (sortedEntries[i]['_mySha256_link'] == _mySha256_link)) {
                    var _entryId = i;
                    break;
                }
            }
            
            var _entry = sortedEntries[_entryId];
            my.log(_entry);
            new MozActivity({
                name: "new",
                data: {
                    type: ["websms/sms", "mail"],
                    number: 0,
                    url: "mailto:?subject=" + encodeURIComponent(_entry.title) + "&body=" + encodeURIComponent(_entry.link),
                    body: _entry.title + "\n" + _entry.link
                }
            });
        };
        
        // Search entries after "dspEntries"
        
        document.body.addEventListener('dspEntries.done', function(event){
            if (liveValues['entries']['search']['visible']) {
                feeds_entries.style.height = "calc(100% - 17.5rem)";
                searchEntries.classList.remove('enable-fxos-white');
                searchEntries.classList.add('enable-fxos-blue');
                document.getElementById('formSearchEntries').classList.remove('_hide');
                document.getElementById('formSearchEntries').classList.add('_show');
                _search(document.getElementById('inputSearchEntries').value);
            }
        });
        
        // Search on input change
        
        document.getElementById('inputSearchEntries').addEventListener('input', function(){
            var _searchString = document.getElementById('inputSearchEntries').value;
            _search(_searchString);
        });
        
        // Add keyword
        
        addKeyword.onclick = function() {
            ui._vibrate();
            var _myKeyword = document.getElementById('inputSearchEntries').value;

            if (_myKeyword.length > 0) {
                var _confirm = window.confirm(document.webL10n.get('confirm-add-keyword') + "\n" + _myKeyword);

                if ((_confirm) && (!keywords.contains(_myKeyword))) {
                    keywords.push(_myKeyword);
                    _saveKeywords();
                    
                    // Reload UI
                    
                    liveValues['entries']['search']['visible'] = true;

                    if ((myFeedsSubscriptions.local.length > 0) ||
                        (myFeedsSubscriptions.feedly.length > 0) ||
                        (myFeedsSubscriptions.theoldreader.length > 0)
                    ){
                        gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
                    } else {
                        ui.echo("feeds-list", "", "");
                        ui.echo("feeds-entries", "", "");
                        ui._onclick(sync, 'disable');
                    }
                    
                    // Done
                    
                    my.message(document.webL10n.get('keyword-was-added'));
                } else {
                    my.message(document.webL10n.get('keyword-was-not-added'));
                }
            
            }
        }

        /* ===================== */
        /* --- Google Events --- */
        /* ===================== */

        document.body.addEventListener('GoogleFeed.load.done', function(event){

            // Save feed as file

            if (navigator.onLine) {
                my._save('cache/google/feeds/' + btoa(event.detail.responseData.feed.feedUrl) + ".json", "application/json", JSON.stringify(event.detail.responseData.feed)).then(function(results) {
                    my.log('GoogleFeed.load.done > Saving feed in cache ok : ' + event.detail.responseData.feed.feedUrl + ' ('+btoa(event.detail.responseData.feed.feedUrl)+')');
                }).catch(function(error) {
                    my.error("ERROR saving feed in cache : " + event.detail.responseData.feed.feedUrl + ' ('+btoa(event.detail.responseData.feed.feedUrl)+')');
                    my.alert("ERROR saving feed in cache :\n" + event.detail.responseData.feed.feedUrl);
                });
            }

            // Add feed entries to array "unsortedEntries"

                gf.addFeed(event.detail.responseData.feed);

            // Check if all feeds were loaded

                var _nbFeedsToLoad = event.detail.responseData._myParams.nbFeeds;
                var _nbFeedsLoaded = gf.getNbFeedsLoaded();
                gf.setNbFeedsLoaded(++_nbFeedsLoaded);

                // Percentage of loading ?

                ui._loading(Math.round((100 * _nbFeedsLoaded) / _nbFeedsToLoad));

                // ---

                if (_nbFeedsLoaded == _nbFeedsToLoad) {
                    dspEntries(gf.getEntries(), params.entries.nbDaysAgo, params.feeds.selectedFeed);
                    dspFeeds(gf.getFeeds());
                    dspSettings();
                    updateFeedsPulsations();
                    //_saveSubscriptions(false);
                }

                if (_nbFeedsLoaded >= _nbFeedsToLoad) {
                    ui._loading(100); ui.echo("loading", "", "");
                    if (navigator.onLine) {
                        ui._onclick(sync, 'enable');
                    }
                }

            // ---

        }, true);

        document.body.addEventListener('GoogleFeed.load.error', function(event){

            // Check if all feeds were loaded

                my.error(event);

                var _nbFeedsToLoad = event.detail._myParams.nbFeeds; // different de "done"
                var _nbFeedsLoaded = gf.getNbFeedsLoaded();
                gf.setNbFeedsLoaded(++_nbFeedsLoaded);

                // Percentage of loading ?

                ui._loading(Math.round((100 * _nbFeedsLoaded) / _nbFeedsToLoad));

                // ---

                if (_nbFeedsLoaded == _nbFeedsToLoad) {
                    dspEntries(gf.getEntries(), params.entries.nbDaysAgo, params.feeds.selectedFeed);
                    dspFeeds(gf.getFeeds());
                    dspSettings();
                    updateFeedsPulsations();
                    //_saveSubscriptions(false);
                }

                if (_nbFeedsLoaded >= _nbFeedsToLoad) {
                    ui._loading(100); ui.echo("loading", "", "");
                    if (navigator.onLine) {
                        ui._onclick(sync, 'enable');
                    }
                }

            // ---

        }, true);

        document.body.addEventListener('GoogleFeed.find.done', findFeedsDisplayResults, true);

        /* ===================== */
        /* --- Feedly Events --- */
        /* ===================== */

        document.body.addEventListener('Feedly.login.done', function(response){
            _loginInProgress['feedly'] = true;
            my.log(feedly.getToken());
            params.accounts.feedly.logged = true;
            _saveParams();
            document.getElementById('feedlyLogin').checked = true; // Enable settings checkbox
            feedly.getSubscriptions(); // CustomEvent Feedly.getSubscriptions.done, Feedly.getSubscriptions.error
        });

        document.body.addEventListener('Feedly.login.error', function(response){
            my.log('CustomEvent : Feedly.login.error', arguments);
            my.message('Feedly login error');
        });

        document.body.addEventListener('Feedly.getSubscriptions.done', function(response){
            my.log('CustomEvent : Feedly.getSubscriptions.done');
            var _subscriptions = response.detail;
            var _feed = '';
            var _newFeeds = [];
            for (var i = 0; i < _subscriptions.length; i++) {
                _feed = {
                    'url': _subscriptions[i].id.substr(5, _subscriptions[i].id.length),
                    'pulsations': params['feeds']['defaultPulsations'],
                    'account': 'feedly',
                    'id': _subscriptions[i].id
                };
                _newFeeds.push(_feed);
            }
            addNewSubscriptions(_newFeeds);
            gf.setFeedsSubscriptions(myFeedsSubscriptions);
            
            if (_loginInProgress['feedly'] == true ) {
                _loginInProgress['feedly'] = false;
                gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
            }
            
            my._save("subscriptions.feedly.json", "application/json", JSON.stringify(myFeedsSubscriptions.feedly)).then(function(results) {
                my.log("Save file subscriptions.feedly.json");
            }).catch(function(error) {
                my.error("ERROR saving file subscriptions.feedly.json", error);
                my.alert("ERROR saving file subscriptions.feedly.json");
            });
            my._save("cache/feedly/subscriptions.json", "application/json", JSON.stringify(_subscriptions)).then(function(results) {
                my.log("Save file cache/feedly/subscriptions.json");
            }).catch(function(error) {
                my.error("ERROR saving file cache/feedly/subscriptions.json", error);
                my.alert("ERROR saving file cache/feedly/subscriptions.json");
            });
        });

        document.body.addEventListener('Feedly.getSubscriptions.error', function(response) {
            my.log('CustomEvent : Feedly.getSubscriptions.error', arguments);
            my.message(document.webL10n.get('feedly-get-subscriptions-error') + response.detail.message);
        });

        /* ============================= */
        /* --- The Old Reader Events --- */
        /* ============================= */

        document.body.addEventListener('TheOldReader.login.done', function(response){
            _loginInProgress['theoldreader'] = true;
            my.log('TheOldReader.getToken()', theoldreader.getToken());
            params.accounts.theoldreader.logged = true;
            _saveParams();
            document.getElementById('theoldreaderCheckbox').checked = true; // Enable settings checkbox
            document.getElementById('theoldreaderForm').style.cssText = 'display: none';
            theoldreader.getSubscriptions(); // CustomEvent TheOldReader.getSubscriptions.done, TheOldReader.getSubscriptions.error
        });

        document.body.addEventListener('TheOldReader.login.error', function(response){
            my.log('CustomEvent : TheOldReader.login.error', arguments);
            my.message('The Old Reader login error');
        });

        document.body.addEventListener('TheOldReader.getSubscriptions.done', function(response){
            my.log('CustomEvent : TheOldReader.getSubscriptions.done', response);
            var _subscriptions = response.detail.subscriptions;
            var _feed = '';
            var _newFeeds = [];
            for (var i = 0; i < _subscriptions.length; i++) {
                _feed = {
                    'url': _subscriptions[i].url,
                    'pulsations': params['feeds']['defaultPulsations'],
                    'account': 'theoldreader',
                    'id': _subscriptions[i].id
                };
                _newFeeds.push(_feed);
            }
            addNewSubscriptions(_newFeeds);
            gf.setFeedsSubscriptions(myFeedsSubscriptions);
            
            if (_loginInProgress['theoldreader'] == true ) {
                _loginInProgress['theoldreader'] = false;
                gf.loadFeeds(params.entries.dontDisplayEntriesOlderThan);
            }
            
            my._save("subscriptions.theoldreader.json", "application/json", JSON.stringify(myFeedsSubscriptions.theoldreader)).then(function(results) {
                my.log("Save file subscriptions.theoldreader.json");
            }).catch(function(error) {
                my.error("ERROR saving file subscriptions.theoldreader.json", error);
                my.alert("ERROR saving file subscriptions.theoldreader.json");
            });
            my._save("cache/theoldreader/subscriptions.json", "application/json", JSON.stringify(_subscriptions)).then(function(results) {
                my.log("Save file cache/theoldreader/subscriptions.json");
            }).catch(function(error) {
                my.error("ERROR saving file cache/theoldreader/subscriptions.json", error);
                my.alert("ERROR saving file cache/theoldreader/subscriptions.json");
            });
        });

        document.body.addEventListener('TheOldReader.getSubscriptions.error', function(response) {
            my.log('CustomEvent : TheOldReader.getSubscriptions.error', arguments);
            my.message('The Old Reader error');
        });

        // ============
        // --- Main ---
        // ============

        ui.init();
        ui._quickScrollTo(2);
    };
