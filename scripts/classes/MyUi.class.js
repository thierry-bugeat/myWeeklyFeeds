/* ============ */
/* --- MyUi --- */
/* ============ */

var MyUi = function() {
    _MyUi = this;
    
    // DOM elements :

    var main                    = document.getElementById('main');
    var main_entry_container    = document.getElementById("main-entry-container");
    var main_entry              = document.getElementById("main-entry");
    var browser                 = document.getElementById("browser");
    var loading                 = document.getElementById("loading");
    var feeds_entries           = document.getElementById("feeds-entries");

    var sync                    = document.getElementById("sync");
    var menu                    = document.getElementById("menu");
    var topup                   = document.getElementById("topup");
    var search                  = document.getElementById("search");
    var settingsOpen            = document.getElementById("settingsOpen");
    var find_feeds              = document.getElementById("find-feeds");
    var findFeedsOpen           = document.getElementById("findFeedsOpen");
    var findFeedsClose          = document.getElementById("findFeedsClose");
    var findFeedsSubmit         = document.getElementById("findFeedsSubmit");
    var share                   = document.getElementById("share");
    var feedsEntriesNbDaysAgo   = document.getElementById("feedsEntriesNbDaysAgo");
    var displayGrid             = document.getElementById("displayGrid");
    var displayCard             = document.getElementById("displayCard");
    var displayList             = document.getElementById("displayList");
    
    var searchEntries           = document.getElementById("searchEntries");
    var resetSearchEntries      = document.getElementById("resetSearchEntries");
}

MyUi.prototype.init = function() {

    _MyUi._onclick(topup, 'disable');     // Disable "topup" button when application start
    _MyUi._onclick(sync, 'disable');      // Disable "sync" button when application start
    _MyUi._onclick(nextDay, 'disable');
    
    _MyUi._onclick(search, 'disable');    // Not yet implemented
    
    _MyUi.selectThemeIcon();
        
    // =======================================
    // --- Button [topup] enable / disable ---
    // =======================================
    
    var _topup = {
        "previousScrollTop": 0, 
        "previousStatus": "disabled"
    };
    
    setInterval(function() {
        
        // Scroll in progress
        
        if (feeds_entries.scrollTop != _topup['previousScrollTop']) {
            
            if (_topup['previousScrollTop'] == 0) { 
                _MyUi._onclick(topup, 'enable'); 
                _topup['previousStatus'] = 'enabled'; 
            }
            
            _topup['previousScrollTop'] = feeds_entries.scrollTop;
        } 
        
        // End scroll
        
        else {
            
            if ((_topup['previousStatus'] == 'enabled') && (feeds_entries.scrollTop == 0)) {
                _MyUi._onclick(topup, 'disable'); 
                _topup['previousStatus'] = 'disabled';
            }
        }
        
    }, 500);
    
    topup.onclick           = function(event) { _MyUi._onclick(topup, 'disable'); feeds_entries.scrollTop = 0; }
    
    // ==============
    // --- Events ---
    // ==============
        
    this.bind();
};

MyUi.prototype.bind = function() {
    
};

/**
 * Enable or disable UI element.
 * Change opacity and enable or disable click event.
 * @param {string} DOM ID element
 * @param {string} "enable", "disable"
 * https://developer.mozilla.org/en-US/docs/Web/CSS/pointer-events
 * */
MyUi.prototype._onclick = function(_this, pointerEvents) {
    console.log(_this);
    
    if (_this !== null) {
        if (pointerEvents == 'enable') {
            _this.classList.remove("disable");
            _this.classList.add("enable");
            if (_this.id == 'sync') {sync.classList.remove("rotation");}
        } else {
            _this.classList.remove("enable");
            _this.classList.add("disable");
            if (_this.id == 'sync') {sync.classList.add("rotation");}
        }
    }
}

/**
 * Disable UI elements.
 * Used when app is offline as startup.
 * @param {sting} _status "disable"
 * */
MyUi.prototype._disable = function(_status) {
    _MyUi.toggle('disable');
}

/**
 * Change opacity of UI elements when network connection change.
 * @param {string} _status "enable", "disable"
 * */
MyUi.prototype.toggle = function(_status) {
    
    // ==========================
    // --- CSS class _online_ ---
    // ==========================
    
    var _items = document.querySelectorAll("._online_");
    for (var i = 0; i < _items.length; i++) {
        _MyUi._onclick(_items[i], _status);
    }
    
    // Small entries :
                
    if (!params.entries.displaySmallEntries) {
        _MyUi._smallEntries('hide');
    }
    
    // =======================
    // --- Settings screen ---
    // =======================
    
    // 1) Update settings message
                
    _MyUi.echo("onLine", _status, "");
}

/**
 * Output one html string in div element
 * 
 * @param {string} divId    : Div id element
 * @param {string} msg      : Html string to write
 * @param {string} placement: "append", "prepend", ""
 * */
MyUi.prototype.echo = function(divId, msg, placement) {
    var _out = document.getElementById(divId);
    if(!_out) { return; }
    
    if (placement == 'prepend') {
        _out.innerHTML = msg + _out.innerHTML;
    } else if (Boolean(placement)) {
        _out.innerHTML = _out.innerHTML + msg;
    } else {
        _out.innerHTML = msg;
    }

}

/**
 * Display loading bar.
 * param {int} percentage
 * */
MyUi.prototype._loading = function(percentage) {
    if (percentage >= 100) {
        loading.style.cssText = "width: 0%";
    } else {
        loading.style.cssText = "width: " + percentage + "%";
    }
}

/**
 * Scroll main div to specified screen.
 * @param {screenX} int
 * 0 : Search feed
 * 1 : Feeds list
 * 2 : Entries list
 * 3 : Settings screen
 * 4 : Entry
 * */
MyUi.prototype._scrollTo = function(screenX) {
    if (params.settings.ui.animations) {
        _MyUi._smoothScrollTo(screenX, 250);
    } else {
        _MyUi._quickScrollTo(screenX);
    }
}

MyUi.prototype._quickScrollTo = function(screenX) {
    window.setTimeout(function() {
        
        var _x = ('-' + (screenX * 20) + '%').toString();

        main.style.cssText = 'transform: translateX('+_x+');';
        
    }); // Schedule the execution for later
}

MyUi.prototype._smoothScrollTo = function (screenX, duration) {
    
    window.setTimeout(function() {
        
        var _x = ('-' + (screenX * 20) + '%').toString();

        main.style.cssText = 'transition: transform 0.25s linear; transform: translateX('+_x+');';
        
    }); // Schedule the execution for later
};

/**
 * Show/Hide small entries
 * @param {string} status "hide" "show"
 * */
MyUi.prototype._smallEntries = function (status) {
    
    var _small_entries = document.querySelectorAll(".small");
    var _css = "";
    
    status == "show" ?
        _css = "display : block;" : _css = "display : none;";

    for (var i = 0; i < _small_entries.length; i++) {
        _small_entries[i].style.cssText = _css; 
    }
    
    // From status hide (unchecked) to status show (checked)
    // => Reset small entries opacity
    
    if (status == "show") {
        var _tmp = (navigator.onLine) ? "enable" : "disable";
        for (var i = 0; i < _small_entries.length; i++) {
            _MyUi._onclick(_small_entries[i], _tmp); 
        }
    }
};
    
/**
 * Change element opacity
 * @param {string} _this DOM element
 * @return {null}
 * */
MyUi.prototype.fade = function (_this) {
    _this.style.cssText = "opacity : 0.4;";
};


MyUi.prototype.selectThemeIcon = function () {
    if (params.entries.theme == 'grid') {
        _MyUi._onclick(displayGrid, 'disable');
        _MyUi._onclick(displayCard, 'enable');
        _MyUi._onclick(displayList, 'enable');
    } else if (params.entries.theme == 'card') {
        _MyUi._onclick(displayGrid, 'enable');
        _MyUi._onclick(displayCard, 'disable');
        _MyUi._onclick(displayList, 'enable');
    } else {
        _MyUi._onclick(displayGrid, 'enable');
        _MyUi._onclick(displayCard, 'enable');
        _MyUi._onclick(displayList, 'disable');
    }
};
