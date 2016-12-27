# aws-slack-notifications


## Setup instructions. 
### Prerequisites:
* Get the deploy_stack.rb file from https://github.com/jchrisfarris/aws_scripts
* Get your Webhook URL from Slack
* /join a channel 
* Deployment Bucket to push the lambda.zip file to

### Create the manifest
* deploy_stack.rb -g slack_notificationsTemplate.yaml | tee ACCOUNTIDENTIFIER-Manifest.yaml
* Edit the manifest
* Be sure to set all the parameters in the Manifest file to be correct
* Add the following for the PreInstall script
```yaml
# Preinstall script will build the zip upload the Lambda code to the S3 bucket
PreInstallScript: |
  #!/bin/bash -xe

  if [ "x{{pLambdaVersion}}" == "x" ] ; then
    echo "Didn't specify pLambdaVersion on the commandline "
    exit 1
  fi


  object="s3://{{pArtifactBucket}}/{{pArtifactPrefix}}/{{pLambdaVersion}}/{{pSlackLambdaZipFile}}"
  zip="{{pSlackLambdaZipFile}}"

  Lambda_Dir=../lambda

  echo "Pushing new Slack Lambda to S3 bucket $object"
  cd $Lambda_Dir 
  zip $zip slack_notify_lambda.js && aws s3 cp $zip $object && rm $zip
```

### Deploy it
```
deploy_stack.rb -m ACCOUNTIDENTIFIER-Manifest.yaml
```