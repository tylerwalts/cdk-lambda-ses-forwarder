import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as Ses from '../lib/ses-stack';

test('Stack creates Lambda function', () => {
    const app = new cdk.App();
    const stack = new Ses.SesStack(app, 'MyTestStack');
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x'
    });
});
