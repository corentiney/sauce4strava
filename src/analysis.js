
sauce.ns('analysis', function(ns) {
    'use strict';

    var ctx = {};
    var default_ftp = 200;

    /* TODO: Move to user options. */
    var cp_periods = [
        ['5 s', 5],
        ['15 s', 15],
        ['30 s', 30],
        ['1 min', 60],
        ['2 min', 120],
        ['5 min', 300],
        ['10 min', 600],
        ['15 min', 900],
        ['20 min', 1200],
        ['30 min', 1800],
        ['1 hour', 3600]
    ];

    var onStreamData = function() {
        var streams = pageView.streams();
        var watts_stream = streams.getStream('watts');
        var is_watt_estimate = !watts_stream;
        if (!watts_stream) {
            watts_stream = streams.getStream('watts_calc');
            if (!watts_stream) {
                console.info("No power data for this activity.");
            }
            /* Only show large period for watt estimates. */
            while (cp_periods[0][1] < 300) {
                cp_periods.shift();
            }
        }

        var np = watts_stream ? sauce.power.calcNP(watts_stream) : undefined;
        var np_val = np && np.value;
        var ts_stream = streams.getStream('time'); 
        var weight_kg = pageView.activityAthleteWeight();
        var weight_unit = pageView.activityAthlete().get('weight_measurement_unit');
        var if_ = np && np_val / ctx.ftp;
        var stats_frag = jQuery(ctx.tertiary_stats_tpl({
            np: np_val,
            weight_unit: weight_unit,
            weight_norm: (weight_unit == 'lbs') ? weight_kg * 2.20462 : weight_kg,
            ftp: ctx.ftp,
            ftp_origin: ctx.ftp_origin,
            if_: if_,
            tss: np && sauce.power.calcTSS(np, if_, ctx.ftp)
        }));
        var ftp_link = stats_frag.find('.provide-ftp');
        var ftp_input = ftp_link.siblings('input');

        ftp_input.keyup(function(ev) {
            if (ev.keyCode == 27 /* escape */) {
                ftp_input.hide();
                ftp_link.html(val).show();
                return;
            } else if (ev.keyCode != 13 /* enter */) {
                return;
            }
            var val = ftp_input.val();
            if (val === '') {
                val = null;
            } else {
                val = Number(ftp_input.val());
                if (!val || val < 0 || val > 600) {
                    jQuery('<div title="Invalid FTP Wattage">' +
                           '<b>"' + ftp_input.val() + '" is not a valid FTP.</b>' +
                           '<br/><br/>' +
                           'Acceptable range: 0-600' +
                           '</div>').dialog({modal: true});
                    return;
                }
            }
            ftp_input.hide();
            ftp_link.html(val).show();
            jQuery('<div title="Reloading...">' +
                   '<b>Reloading page to reflect FTP change."' +
                   '</div>').dialog({modal: true});
            sauce.comm.setFTP(ctx.athlete_id, val, function() {
                location.reload();
            });
        });
            
        ftp_link.click(function() {
            ftp_input.width(ftp_link.hide().width()).show();
        });

        stats_frag.insertAfter(jQuery('.inline-stats').last());

        if (watts_stream) {
            var open_dialog = [];
            var hr_stream = streams.getStream('heartrate');
            var critpower_frag = jQuery(ctx.critpower_tpl({
                cp_periods: cp_periods,
                is_watt_estimate: is_watt_estimate
            }));
            critpower_frag.insertAfter(jQuery('#pagenav').first());
            cp_periods.forEach(function(period) {
                var cp = sauce.power.critpower(ts_stream, watts_stream, period[1]);
                if (cp !== undefined) {
                    var hr_arr;
                    if (hr_stream) {
                        var start = cp.offt - cp._values.length + cp.padCount();
                        hr_arr = hr_stream.slice(start, cp.offt);
                    }
                    var el = jQuery('#sauce-cp-' + period[1]);
                    el.html(Math.round(cp.avg()));
                    el.parent().click(function(x) {
                        var existing = open_dialog.shift();
                        if (existing) {
                            existing.dialog('close');
                        }
                        var dialog = moreinfoDialog.call(ctx, {
                            cp_period: period,
                            cp_roll: cp,
                            hr_arr: hr_arr,
                            weight: weight_kg,
                            anchor_to: el.parent()
                        });
                        var row = el.closest('tr');
                        dialog.on('dialogclose', function() {
                            row.removeClass('selected');
                        });
                        row.addClass('selected');
                        open_dialog.push(dialog);
                    });
                    jQuery('#sauce-cp-row-' + period[1]).show();
                }
            });
        }
    };

    var rank_map = [
        [/^World Class.*/, 'world-tour.png'],
        [/^Pro.?/, 'pro.png'],
        [/^Cat 1.?/, 'cat1.png'],
        [/^Cat 2.?/, 'cat2.png'],
        [/^Cat 3.?/, 'cat3.png'],
        [/^Cat 4.?/, 'cat4.png'],
        [/^Cat 5.?/, 'cat5.png']
    ];

    var rank_image = function(rank_cat) {
        for (var i = 0; i < rank_map.length; i++) {
            if (rank_cat.match(rank_map[i][0])) {
                return sauce.extURL + 'assets/ranking/' + rank_map[i][1];
            }
        }
    };

    var moreinfoDialog = function(opts) {
        var crit = opts.cp_roll;
        var hr = opts.hr_arr;
        var cp_avg = crit.avg();
        var np = sauce.power.calcNP(crit._values);
        var pwr_size = crit._values.length;
        var avgpwr = np.value ? np : {value: cp_avg, count: pwr_size};
        var if_ = avgpwr.value / ctx.ftp;
        var w_kg = cp_avg / opts.weight;
        var gender = pageView.activityAthlete().get('gender') === 'F' ? 'female' : 'male';
        var rank = sauce.power.rank(opts.cp_period[1], w_kg, gender);
        var rank_cat = rank && sauce.power.rankCat(rank);
        var data = {
            title: 'Critical Power: ' + opts.cp_period[0],
            start_time: (new Strava.I18n.TimespanFormatter()).display(crit._times[0]),
            w_kg: w_kg,
            peak_power: Math.max.apply(null, crit._values),
            cp_avg: cp_avg,
            np: np.value,
            tss: sauce.power.calcTSS(avgpwr, if_, ctx.ftp),
            rank: rank,
            rank_cat: rank_cat,
            rank_image: rank && rank_image(rank_cat),
            if_: if_,
            hr_avg: hr && (_.reduce(hr, function(a, b) { return a + b; }, 0) / hr.length),
            hr_max: Math.max.apply(null, hr),
            hr_min: Math.min.apply(null, hr)
        };

        var moreinfo_frag = jQuery(ctx.moreinfo_tpl(data));
        moreinfo_frag.find('.start_time_link').click(function() {
            pageView.router().changeMenuTo([
                'analysis',
                crit.offt - pwr_size + crit.padCount(),
                crit.offt
            ].join('/'));
        });

        var dialog = moreinfo_frag.dialog({
            resizable: false,
            width: 220,
            dialogClass: 'sauce-freerange-dialog',
            show: {
                effect: 'slideDown',
                duration: 200
            },
            position: {
                my: 'left center',
                at: 'right center',
                of: opts.anchor_to
            },
            buttons: {
                Close: function() {
                    dialog.dialog('close');
                }
            }
        });

        /* Smooth data for best visaul appearance. */
        var pwr_stream;
        if (pwr_size >= 240) {
            pwr_stream = [];
            var increment = Math.floor(pwr_size / 120);
            for (var i = 0; i < pwr_size; i += increment) {
                var v = 0;
                var ii;
                for (ii = 0; ii < increment && i + ii < pwr_size; ii++) {
                    v += crit._values[i+ii];
                }
                pwr_stream.push(Math.round(v / ii));
            }
        } else {
            pwr_stream = crit._values;
        }

        /* Must run after the dialog is open for proper rendering. */
        moreinfo_frag.find('.sauce-sparkline').sparkline(pwr_stream, {
            type: 'line',
            width: '100%',
            height: 56,
            lineColor: '#EA400D',
            fillColor: 'rgba(234, 64, 13, 0.61)',
            chartRangeMin: 0,
            normalRangeMin: 0,
            normalRangeMax: cp_avg,
            tooltipSuffix: 'w'
        });

        return dialog;
    };

    var renderComments = function(skip_quote) {
        var ctrl = pageView.commentsController();
        var comments = ctrl.getFromHash('Activity-' + ctx.activity_id);
        var stack = [];
        comments.forEach(function(x) {
            var dt = new Date(jQuery(x.timestamp).attr('datetime'));
            x.timeago = sauce.time.ago(dt);
            stack.push(ctx.comments_tpl(x));
            if (x.comment.length > 1) {
                console.warn('Unexpected comment array length >1');
                console.dir(x.comment);
            }
            x.comment.forEach(function(xx) {
                if (xx.type != 'raw_token') {
                    console.warn('Unhandled comment type:', xx.type);
                    console.dir(x.comment);
                }
            });
            
        });
        ctx.comments_holder.html(stack.join(''));
        if (!skip_quote) {
            ctx.comment_el.find('input').val(_.sample(ctx.quotes));
        }
    };
 
    var load = function() {
        console.info('Staging Strava Sauce...');
        /* Avoid racing with other stream requests...
         * This strange test tells us the `streamRequest.request` routine is
         * in-flight because the callbacks associated with that func will
         * clear the `required` array.  While strange looking, this is the
         * best way to detect a common condition where network loading of
         * stream data is currently running and we would do best to wait for
         * it's finish and thus avoid double loading data. */
        var streamRequestActive = !!pageView.streamsRequest.required.length;
        if (streamRequestActive) {
            console.log("Deferred load of additional streams...");
            pageView.streamsRequest.deferred.done(load_streams);
        } else {
            console.log("Immediate load of additional streams");
            load_streams();
        }
    };

    var load_streams = function() {
        console.info('Loading Strava Sauce...');
        var streams = pageView.streams();
        if (!streams.getStream('watts')) {
            var resources = ['watts'];
            if (!streams.getStream('watts_calc')) {
                resources.push('watts_calc');
            }
            if (!streams.getStream('time')) {
                resources.push('time');
            }
            console.info("Fetching wattage streams:", resources);
            streams.fetchStreams(resources, {
                success: start,
                error: function() {
                    console.warn("Failed to load wattage streams. Load Aborted");
                }
            });
        } else {
            console.info("Wattage stream already available");
            start();
        }
    };

    var start = function() {
        console.info('Starting Strava Sauce...');
        ctx.athlete_id = pageView.activityAthlete().get('id');
        ctx.activity_id = pageView.activity().get('id');

        sauce.func.runAfter(Strava.Charts.Activities.BasicAnalysisElevation,
                            'displayDetails', function(ret, start, end) {
            ns.handleSelectionChange(start, end);
        });
        sauce.func.runAfter(Strava.Charts.Activities.LabelBox, 'handleStreamHover',
                            function(ret, _, start, end) {
            ns.handleSelectionChange(start, end);
        });

        var final = new sauce.func.IfDone(onStreamData);

        var tpl_url = sauce.extURL + 'templates/';
        jQuery.ajax(tpl_url + 'tertiary-stats.html').done(final.before(function(data) {
            ctx.tertiary_stats_tpl = _.template(data);
        }));
        jQuery.ajax(tpl_url + 'critpower.html').done(final.before(function(data) {
            ctx.critpower_tpl = _.template(data);
        }));
        jQuery.ajax(tpl_url + 'critpower-moreinfo.html').done(final.before(function(data) {
            ctx.moreinfo_tpl = _.template(data);
        }));

        ctx.comment_el = jQuery([
            '<div class="sauce-new-comment">',
                '<div>',
                    '<div class="sauce-label">Say something</div>',
                    '<input type="text"/>',
                    '<button>Comment</button>',
                '</div>',
            '</div>'
        ].join(''));

        jQuery.getJSON(sauce.extURL + 'src/quotes.json').done(final.before(function(data) {
            ctx.quotes = data;
            ctx.comment_el.find('input').val(_.sample(data));
        }));

        ctx.comments_holder = jQuery('<div class="sauce-inline-comments"></div>');
        jQuery('.activity-summary').append(ctx.comments_holder);

        var submit_comment = function() {
            var comment = ctx.comment_el.find('input').val();
            pageView.commentsController().comment('Activity', ctx.activity_id, comment);
        };

        ctx.comment_el.find('input').click(function() {
            jQuery(this).select();
        });
        ctx.comment_el.find('button').click(submit_comment);
        ctx.comment_el.find('input').keypress(function(e) {
            if (e.which == 13) {
                submit_comment();
            }
        });
        jQuery('.activity-summary').append(ctx.comment_el);

        jQuery.ajax(tpl_url + 'inline-comment.html').done(function(data) {
            ctx.comments_tpl = _.template(data);
            pageView.commentsController().on('commentCompleted', function() {
                renderComments();
            });
            renderComments(true);
        });

        final.inc();
        sauce.comm.getFTP(ctx.athlete_id, function(ftp) {
            assignFTP(ftp);
            final.dec();
        });
    };

    var assignFTP = function(sauce_ftp) {
        var power = pageView.powerController && pageView.powerController();
        /* Sometimes you can get it from the activity.  I think this only
         * works when you are the athlete in the activity. */
        var strava_ftp = power ? power.get('athlete_ftp')
                               : pageView.activity().get('ftp');
        var ftp;
        if (!sauce_ftp) {
            if (strava_ftp) {
                ftp = strava_ftp;
                ctx.ftp_origin = 'strava';
            } else {
                ftp = default_ftp;
                ctx.ftp_origin = 'default';
            }
        } else {
            if (strava_ftp && sauce_ftp != strava_ftp) {
                console.warn("Sauce FTP override differs from Strava FTP:",
                             sauce_ftp, strava_ftp);
            }
            ftp = sauce_ftp;
            ctx.ftp_origin = 'sauce';
        }
        ctx.ftp = ftp;
    };

    var handleSelectionChange = function(start, end) {
        var streams = pageView.streams();
        var watts_stream = streams.getStream('watts');
        if (!watts_stream) {
            watts_stream = streams.getStream('watts_calc');
            if (!watts_stream) {
                return;
            }
        }
        var selection = watts_stream.slice(start, end);
        var np = sauce.power.calcNP(selection).value;
        var avg = selection.reduce(function(acc, x) { return acc + x; }) / selection.length;
        var el = jQuery('text.label:contains(Power)').siblings('.avg-js');
        var text = ['Avg ', Math.round(avg)];
        if (np) {
            text = text.concat([' (', Math.round(np), 'np)']);
        }
        el.html(text.join(''));
    };
 
    return {
        load: load,
        moreinfoDialog: moreinfoDialog,
        renderComments: renderComments,
        handleSelectionChange: handleSelectionChange
    };
});


if (!window.pageView) {
    console.info("No pageView context: Not loading sauce analysis views");
} else {
    sauce.analysis.load();
}
