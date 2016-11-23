/**

This function will accept events sent by CloudWatch events, parse them, and send a webhook 
notification to slack.

 */



var AWS = require('aws-sdk');
var url = require('url');
var https = require('https');
var hookUrl;
var alias;



function postMessage(message, context, callback) {
    var body = JSON.stringify(message);
    var options = url.parse(process.env.HOOK_URL);
    options.method = 'POST';
    options.headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    };

    var postReq = https.request(options, function(res) {
        var chunks = [];
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            // return chunks.push(chunk);
            chunks.push(chunk);
        });
        res.on('end', function() {
            var body = chunks.join('');
            if (callback) {
                callback(null, {
                    body: body,
                    statusCode: res.statusCode,
                    statusMessage: res.statusMessage
                }, context);
            }
        });
        // return res;
        res.on('error', function() {
            if (callback) {
                callback(err, null, context);
            }
        });
    });

    postReq.write(body);
    postReq.end();
}

function handle_postMessage_toSlack(err, response, context) {
    if (err) context.fail("Server error sending message");
    if (response.statusCode < 400) {
        console.info('Message posted successfully');
        context.succeed();
    } else if (response.statusCode < 500) {
        console.error("Error posting message to Slack API: " + response.statusCode + " - " + response.statusMessage);
        context.succeed();  // Don't retry because the error is due to a problem with the request
    } else {
        // Let Lambda retry
        context.fail("Server error when processing message: " + response.statusCode + " - " + response.statusMessage);
    }
}

// each event.source should be it's own function
function processCloudformation(event, slackMessage) {
    var detail = event.detail;
    var user_arn=detail.userIdentity.arn;
    var eventSource=detail.eventSource;
    var awsRegion=detail.awsRegion;
    var stackName=detail.requestParameters.stackName;
    var eventName=detail.eventName;
    var eventTime=detail.eventTime;
    slackMessage.username = process.env.ACCOUNT_NAME + " CloudFormation Event";
    slackMessage.text = eventTime + ": " + user_arn + " did " + eventName + " in " + awsRegion + " on " + stackName;
    console.info("Message: " + slackMessage.text); 
}

function processIAM(event, slackMessage) { 
    var detail = event.detail;
    var user_arn=detail.userIdentity.arn;
    var eventSource=detail.eventSource;
    var awsRegion=detail.awsRegion;
    // var stackName=detail.requestParameters.stackName;
    var eventName=detail.eventName;
    var eventTime=detail.eventTime;
    slackMessage.username = process.env.ACCOUNT_NAME + " IAM Activity";
    slackMessage.text = eventTime + ": " + user_arn + " did " + eventName + " in " + awsRegion; 
    console.info("Message: " + slackMessage.text);
}

function processEC2(event, slackMessage, context) {
    var region = event.region;
    var instance_id = event['detail']['instance-id'];
    var state = event.detail.state;
    var instance_name = 'BlankName';

    // Lets get deets of the instance
    var ec2 = new AWS.EC2();

    var params = { InstanceIds: [ instance_id ] };
    ec2.describeInstances(params, function(err, data) {
        if(err) {
            console.error(err.toString());
        } else {
            var instance = data.Reservations[0].Instances[0];
            for(var t=0,tlen=instance.Tags.length; t<tlen; ++t) {
                if(instance.Tags[t].Key === 'Name') {
                    instance_name = instance.Tags[t].Value;
                }
            }
            slackMessage.username = process.env.ACCOUNT_NAME + " Instance State Change Event";
            slackMessage.text = event.time + " " + instance_name + " (" + instance_id + ") in " + region + " changed to " + state;
            console.info("Message: " + slackMessage.text);
            postMessage(slackMessage, context, handle_postMessage_toSlack);
        }
    });
}

var processSignin = function(event, slackMessage) {
    var region = event.region;
    var user = event.detail.userIdentity.arn;
    var eventName = event.detail.eventName;
    var srcIP = event.detail.sourceIPAddress;
    var status = event.detail.responseElements.ConsoleLogin;
    var mfa = event.detail.additionalEventData.MFAUsed;
    slackMessage.username = process.env.ACCOUNT_NAME + " Account Login Event";
    slackMessage.text = event.time + " " + eventName + " to " + region + " for " + user + " from " + srcIP + " Status: " + status + " (MFA: " + mfa + ")";
    console.info("Message: " + slackMessage.text);
};

var processCloudWatchEvent = function(event, context) {

	console.log("Got Event: " + event.source);

    // console.log(event);
    var slackMessage = {
        channel: process.env.SLACK_CHANNEL,
    };
    if (process.env.ICON_EMOJI) {
        slackMessage.icon_emoji = process.env.ICON_EMOJI;
    }

    // Cloudformation Stack Events
    if (event.source == "aws.cloudformation") {
        processCloudformation(event, slackMessage);
        postMessage(slackMessage, handle_postMessage_toSlack);

    // IAM Create User
    } else if (event.source == "aws.iam") {
        processIAM(event, slackMessage);
        postMessage(slackMessage, handle_postMessage_toSlack);

    // EC2 State Change
    } else if (event.source == "aws.ec2") {
        processEC2(event, slackMessage, context);

    // Console Login
    } else if (event.source == "aws.signin" && event.detail.eventName == "ConsoleLogin" ) {
        processSignin(event, slackMessage);
        postMessage(slackMessage, handle_postMessage_toSlack);

    } else {
        console.log("Unknown Event: " + event.source);
        process.exit(0);
    }
};



exports.handler = function(event, context) {

	alias = context.invokedFunctionArn.split(":").pop()
    console.log("Function ARN: " + context.invokedFunctionArn + " Name: " + context.functionName + " Alias: "+ alias);
    processCloudWatchEvent(event, context);

};
