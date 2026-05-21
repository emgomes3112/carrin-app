export class OrderNotFoundError extends Error {
  constructor() {
    super('Order not found.');
    this.name = 'OrderNotFoundError';
  }
}

export class OrderAccessDeniedError extends Error {
  constructor() {
    super('Access denied.');
    this.name = 'OrderAccessDeniedError';
  }
}

export class InvalidOrderTransitionError extends Error {
  constructor(message: string = 'Invalid status transition.') {
    super(message);
    this.name = 'InvalidOrderTransitionError';
  }
}

export class OrderAlreadyAcceptedError extends Error {
  constructor() {
    super('Order already accepted by another partner.');
    this.name = 'OrderAlreadyAcceptedError';
  }
}

export class OrderListLockedError extends Error {
  constructor() {
    super('Order list is locked and cannot be edited.');
    this.name = 'OrderListLockedError';
  }
}

export class MinimumOrderItemsError extends Error {
  constructor() {
    super('Order must have at least 10 items.');
    this.name = 'MinimumOrderItemsError';
  }
}

export class InvalidHandoffPinError extends Error {
  constructor() {
    super('Invalid handoff PIN.');
    this.name = 'InvalidHandoffPinError';
  }
}

export class OrderItemNotFoundError extends Error {
  constructor() {
    super('Order item not found.');
    this.name = 'OrderItemNotFoundError';
  }
}
