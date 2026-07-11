// Smoke test — verifies Jest + ts-jest configuration is working
describe('project setup', () => {
  it('TypeScript and Jest are configured correctly', () => {
    const value: string = 'ok';
    expect(value).toBe('ok');
  });
});
