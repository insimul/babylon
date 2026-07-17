// openapi-emitter.test.ts — unit tests for the OpenAPI-derived emitters (US-CG4):
// collectOperations (the operations.json shape) against a synthetic spec covering
// path/query params, json + multipart bodies, and the C# client emitter against the
// vendored spec.

import { describe, it, expect } from 'vitest';
// eslint-disable-next-line import/extensions
import { collectOperations, refName } from '../openapi-spec.mjs';
// eslint-disable-next-line import/extensions
import { generateCSharpApi } from '../emit-csharp-api.mjs';

const SYNTHETIC = {
  info: { title: 'T', version: '9.9.9' },
  paths: {
    '/items/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getItem',
        summary: 'Get one item.',
        parameters: [{ name: 'verbose', in: 'query', schema: { type: 'boolean' } }],
        responses: {
          '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } },
        },
      },
      post: {
        operationId: 'createItem',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } },
        },
        responses: { '201': { description: 'created' } },
      },
    },
    '/upload': {
      post: {
        operationId: 'upload',
        requestBody: {
          content: { 'multipart/form-data': { schema: { $ref: '#/components/schemas/Upload' } } },
        },
        responses: { '200': { content: { 'text/event-stream': { schema: { type: 'string' } } } } },
      },
    },
  },
};

describe('refName', () => {
  it('resolves a local component $ref, else null', () => {
    expect(refName('#/components/schemas/Foo')).toBe('Foo');
    expect(refName('#/components/schemas/A/B')).toBe('A/B');
    expect(refName('external.json#/x')).toBeNull();
    expect(refName(undefined)).toBeNull();
  });
});

describe('collectOperations', () => {
  const ops = collectOperations(SYNTHETIC);

  it('flattens paths×methods in canonical order (get before post per path)', () => {
    expect(ops.map((o) => o.operationId)).toEqual(['getItem', 'createItem', 'upload']);
  });

  it('merges path-level and operation-level parameters', () => {
    const getItem = ops.find((o) => o.operationId === 'getItem')!;
    expect(getItem.parameters).toEqual([
      { name: 'id', in: 'path', required: true, type: 'string' },
      { name: 'verbose', in: 'query', required: false, type: 'boolean' },
    ]);
    expect(getItem.method).toBe('GET');
  });

  it('captures request bodies (json + multipart) and json response schemas', () => {
    const createItem = ops.find((o) => o.operationId === 'createItem')!;
    expect(createItem.requestBody).toEqual({
      required: true,
      contentType: 'application/json',
      schema: 'Item',
    });

    const getItem = ops.find((o) => o.operationId === 'getItem')!;
    expect(getItem.responseContentType).toBe('application/json');
    expect(getItem.responseSchema).toBe('Item');

    const upload = ops.find((o) => o.operationId === 'upload')!;
    expect(upload.requestBody?.contentType).toBe('multipart/form-data');
    expect(upload.responseContentType).toBe('text/event-stream');
  });
});

describe('generateCSharpApi (vendored spec)', () => {
  const src = generateCSharpApi();

  it('emits the client namespace and one method per operation', () => {
    expect(src).toContain('namespace Insimul.Generated.Api');
    for (const m of [
      'StreamConversationAsync',
      'StreamConversationAudioAsync',
      'EndConversationAsync',
      'HealthCheckAsync',
    ]) {
      expect(src).toContain(m);
    }
  });

  it('maps required/optional properties to nullable-aware C# types', () => {
    // required string: non-nullable + null! initializer
    expect(src).toContain('public string SessionId { get; set; } = null!;');
    // optional string: nullable
    expect(src).toContain('public string? LanguageCode { get; set; }');
    // boolean required: value type, no initializer
    expect(src).toContain('public bool Success { get; set; }');
    // binary -> byte[]
    expect(src).toContain('public byte[] Audio { get; set; } = null!;');
    // [JsonPropertyName] preserves the wire key
    expect(src).toContain('[JsonPropertyName("sessionId")]');
  });

  it('JSON ops return a model; streaming ops return HttpResponseMessage', () => {
    expect(src).toContain('Task<EndSessionResponse> EndConversationAsync');
    expect(src).toContain('Task<HttpResponseMessage> StreamConversationAsync');
    expect(src).toContain('HttpCompletionOption.ResponseHeadersRead');
  });

  it('is deterministic (pure function of the spec)', () => {
    expect(generateCSharpApi()).toBe(src);
  });
});
