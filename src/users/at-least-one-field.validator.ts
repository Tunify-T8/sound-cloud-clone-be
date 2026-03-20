import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'AtLeastOneField', async: false })
export class AtLeastOneFieldConstraint implements ValidatorConstraintInterface {
  validate(_: any, args: ValidationArguments) {
    const obj = args.object as Record<string, any>;
    return Object.values(obj).some((v) => v !== undefined);
  }

  defaultMessage() {
    return 'At least one field must be provided';
  }
}

export function AtLeastOneField(validationOptions?: ValidationOptions) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return function (constructor: Function) {
    registerDecorator({
      name: 'AtLeastOneField',
      target: constructor,
      propertyName: '',
      options: validationOptions,
      constraints: [],
      validator: AtLeastOneFieldConstraint,
    });
  };
}
