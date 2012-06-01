// Number of the weeks in the view
var WEEK_RANGE = 12;

// Format to display calendar week dates in
var DATE_FORMAT = "dd-MMMM";
var DISPLAY_FORMAT = "ddd (d)";

// Ctor - Initializes the google this.calendarIds to be merged.
function Calendar(calendarIds) {
    if (!calendarIds && calendarIds.length < 1) {
        throw new Error("Need at least one calendar id to create a Calendar.");
    }
    this.calendarIds = calendarIds; // calendards to merge
    this.builtIdx = -1;             // index of this.calendarIds already built
                                    // at least show these locations
    this.locations = ["sydney", "melbourne", "brisbane", "perth"];
    this.dates = [];                // dates range to display calendar
    this.data = {};                 // the final merged calendar data
}

Calendar.prototype = {
    // Retrieves events from google this.calendarIds and build the events
    // grouped on found locations. It's async due to nature of 
    // google api and calls back the provided callback function on
    // completion.
    build: function(callback) {
        if (!callback) {
            throw new Error("Missing a callback to build a Calendar");
        }
        if (this.builtIdx == this.calendarIds.length - 1) {
            // done building the calendar data
            callback(this);
            return;
        }

        var minDate = new Date();
        minDate.setDate(minDate.getDate() - minDate.getDay());
        var maxDate = new Date();
        maxDate.setDate((maxDate.getDate() - maxDate.getDay()) +
            (WEEK_RANGE+1)*7);
        ++this.builtIdx;

        // request events from the calendar
        var request = gapi.client.calendar.events.list({
            'calendarId': this.calendarIds[this.builtIdx],
            'singleEvents':true,
            'timeMin':ISODateString(minDate),
            'timeMax':ISODateString(maxDate)
        });

        var self = this;

        request.execute(function (resp) {
            if(resp.items)
            {
                var currentWeek = new Date().getWeek();

                for (var i = 0; i < resp.items.length; i++) {
                    var calendarEntry = resp.items[i];
                    var locationAndPerson = getCalendarLocationAndPerson(calendarEntry);
                    if (!locationAndPerson) continue;
                    var location = locationAndPerson[0];
                    // TODO For now skipping the half-day calendar entries -
                    // where dateTime is used instead of date.
                    if (!calendarEntry.start.date) continue;
                    var date = Date.fromGapiDateString(calendarEntry.start.date);
                    if (date.getWeek() - currentWeek < WEEK_RANGE)
                    {
                        if (self.locations.indexOf(location) == -1)  {
                            self.locations.push(location);
                        }
                    }
                }

                for (i = 0; i < self.locations.length; i++)
                {
                    var found_location = self.locations[i];
                    if (!self.data[found_location]) {
                        self.data[found_location] = {};
                    }
                    for(var j = 0; j < WEEK_RANGE; j++)
                    {
                        var week = new Date();
                        week.setDate(week.getDate() - week.getDay() + (7 * j));

                        var weekFormatted = week.toString(DATE_FORMAT);
                        self.dates[j] = weekFormatted;
                        if (!self.data[found_location][weekFormatted]) {
                            self.data[found_location][weekFormatted] = [];
                        }
                    }
                }

                for (i = 0; i < resp.items.length; i++) {
                    var calendarEvent = resp.items[i];
                    var locationPerson = getCalendarLocationAndPerson(calendarEvent);
                    if (!locationPerson) continue;
                    var eventLocation = locationPerson[0];
                    var eventPerson = locationPerson[1];
                    if (!calendarEvent.start.date) continue;
                    var eventDate = Date.fromGapiDateString(calendarEvent.start.date);
                    eventDate.setDate(eventDate.getDate() - eventDate.getDay());
                    var eventWeek = eventDate.toString(DATE_FORMAT);

                    var startDate = Date.fromGapiDateString(calendarEvent.start.date).toString(DISPLAY_FORMAT);
                    var endDate = Date.fromGapiDateString(calendarEvent.end.date).toString(DISPLAY_FORMAT);

                    var displayString = eventPerson + " (" + eventLocation
                        + ")\n\t" + startDate + " to " + endDate;

                    if(self.dates.indexOf(eventWeek) == -1)
                    {
                        eventDate = Date.fromGapiDateString(calendarEvent.end.date);
                        eventDate.setDate(eventDate.getDate() - eventDate.getDay());
                        eventWeek = eventDate.toString(DATE_FORMAT);
                    }

                    var weekDiff = eventDate.getWeek() - currentWeek;

                    if(weekDiff < WEEK_RANGE && self.dates.indexOf(eventWeek) != -1)
                    {
                        if(self.data[eventLocation][eventWeek].indexOf(eventPerson) == -1)
                            self.data[eventLocation][eventWeek].push(
                                {person:eventPerson, link:calendarEvent.htmlLink, displayString: displayString});
                    }
                }
            }
            
            self.build(callback);
        });
    }
};

function ISODateString(d) {
        function pad(n) {
            return n < 10 ? '0' + n : n;
        }

        return d.getUTCFullYear() + '-' +
                pad(d.getUTCMonth() + 1) + '-' +
                pad(d.getUTCDate()) + 'T' +
                pad(d.getUTCHours()) + ':' +
                pad(d.getUTCMinutes()) + ':' +
                pad(d.getUTCSeconds()) + 'Z';
}

// Extracts calendar entries person and location from its summary
// This is relying on the patterns of entries seen in tw calendards
// so far - new patters may be discovered.
// Returns a list [location, person]
function getCalendarLocationAndPerson(calendarEntry) {
    var locationAndPerson = calendarEntry.summary.split(/\s([oi]n|@|at)\s/);
    if (locationAndPerson &&
            locationAndPerson.length >= 3) {
        var location = locationAndPerson[2].split(" ")[0].toLowerCase();
        if (isLocation(location)) {
            return  [
                        location,
                        locationAndPerson[0] 
                    ];
        }
    }
    return undefined;
}

// Since people use calendar entries to indicate on leave, at uni,
// Mgmnt, etc. we are filtering them out as locations. More to be
// found. Location is converted in lower-case already before being
// passed here.
function isLocation(location) {
    return (['uni', 'mgmt', 'leave'].indexOf(location) == -1);
}

// Safari does not support date format returned by
// gapi calendar events yyyy-mm-dd hence the manual parsing below
Date.fromGapiDateString = function(gapiDateString) {
    var dateParts = gapiDateString.split("-");
    var date = new Date(dateParts[0], dateParts[1]-1, dateParts[2]);
    return date;
};

Date.prototype.getWeek = function() {
    var onejan = new Date(this.getFullYear(),0,1);
    return Math.ceil((((this - onejan) / 86400000) + onejan.getDay()+1)/7);
};
