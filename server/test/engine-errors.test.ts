import { describe, test, expect } from 'bun:test';
import {
  EngineError,
  QueryError,
  SchemaError,
  ConfigError,
  ConnectionError,
  NotFoundError,
  isEngineError,
  isEngineRetryable,
} from '../src/core/engine-errors.ts';

describe('EngineError hierarchy', () => {
  test('EngineError is an Error subclass', () => {
    const err = new EngineError('query', 'test message');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EngineError);
    expect(err.message).toBe('test message');
    expect(err.name).toBe('EngineError');
    expect(err.kind).toBe('query');
    expect(err.retryable).toBe(false);
  });

  test('QueryError has correct kind and is not retryable', () => {
    const err = new QueryError('syntax error');
    expect(err).toBeInstanceOf(EngineError);
    expect(err).toBeInstanceOf(QueryError);
    expect(err.kind).toBe('query');
    expect(err.retryable).toBe(false);
    expect(err.name).toBe('QueryError');
  });

  test('SchemaError has correct kind and is not retryable', () => {
    const err = new SchemaError('missing column foo');
    expect(err).toBeInstanceOf(EngineError);
    expect(err.kind).toBe('schema');
    expect(err.retryable).toBe(false);
  });

  test('ConfigError has correct kind and is not retryable', () => {
    const err = new ConfigError('bad dims', { fix: 'use 1536' });
    expect(err).toBeInstanceOf(EngineError);
    expect(err.kind).toBe('config');
    expect(err.retryable).toBe(false);
    expect(err.fix).toBe('use 1536');
  });

  test('ConnectionError has correct kind and IS retryable', () => {
    const err = new ConnectionError('pool exhausted');
    expect(err).toBeInstanceOf(EngineError);
    expect(err.kind).toBe('connection');
    expect(err.retryable).toBe(true);
  });

  test('NotFoundError has correct kind and is not retryable', () => {
    const err = new NotFoundError('page not found: foo');
    expect(err).toBeInstanceOf(EngineError);
    expect(err.kind).toBe('not_found');
    expect(err.retryable).toBe(false);
  });

  test('cause is propagated', () => {
    const cause = new Error('root cause');
    const err = new QueryError('wrapped', { cause });
    expect((err as { cause?: unknown }).cause).toBe(cause);
  });

  test('isEngineError type guard', () => {
    expect(isEngineError(new QueryError('test'))).toBe(true);
    expect(isEngineError(new Error('plain'))).toBe(false);
    expect(isEngineError(null)).toBe(false);
    expect(isEngineError('string')).toBe(false);
  });

  test('isEngineRetryable returns true only for retryable errors', () => {
    expect(isEngineRetryable(new ConnectionError('test'))).toBe(true);
    expect(isEngineRetryable(new QueryError('test'))).toBe(false);
    expect(isEngineRetryable(new ConfigError('test'))).toBe(false);
    expect(isEngineRetryable(new NotFoundError('test'))).toBe(false);
    expect(isEngineRetryable(new Error('plain'))).toBe(false);
  });

  test('all subclasses can be caught as EngineError', () => {
    const errors: EngineError[] = [
      new QueryError('q'),
      new SchemaError('s'),
      new ConfigError('c'),
      new ConnectionError('conn'),
      new NotFoundError('nf'),
    ];
    for (const e of errors) {
      expect(e).toBeInstanceOf(EngineError);
      expect(typeof e.kind).toBe('string');
    }
  });
});
