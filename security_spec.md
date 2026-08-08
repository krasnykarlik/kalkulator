# Security Specification: Zakázkový Kontrolor

## Data Invariants
1. All projects and costs MUST have an `ownerId` that matches the authenticated user's UID.
2. Costs MUST reference a valid `projectId` that the user has access to.
3. Timestamps (`createdAt`, `updatedAt`) MUST be server-managed.
4. Budget and cost amounts MUST be positive numbers.
5. Project status and cost categories MUST match predefined enums.
6. Once a project is marked as "dokončeno", costs should be immutable (terminal state locking).

## The Dirty Dozen Payloads (Rejection Targets)

1. **Identity Spoofing**: Creating a project with `ownerId` of another user.
2. **State Shortcutting**: Updating `updatedAt` to a future/past date instead of `request.time`.
3. **Resource Poisoning**: Creating a cost with a 1MB description string.
4. **Orphaned Write**: Creating a cost for a `projectId` that doesn't exist.
5. **Cross-Tenant Leak**: Reading a project from another user.
6. **Shadow Field Injection**: Adding an `isAdmin` field to a project document.
7. **Negative Budget**: Setting a project budget to -10,000.
8. **Invalid Enum**: Setting cost category to "dovolená".
9. **Terminal State Bypass**: Adding a cost to a "dokončeno" project.
10. **ID Poisoning**: Using a 2KB junk string as `projectId`.
11. **Email Spoofing**: Accessing data with an unverified email (if restricted).
12. **Blanket Read Attack**: Attempting to list all projects without a UID filter.

## Test Runner (firestore.rules.test.ts)

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: 'gen-lang-client-0186552628',
        firestore: { rules: require('fs').readFileSync('firestore.rules', 'utf8') },
    });
});

afterAll(async () => {
    await testEnv.cleanup();
});

test('Should deny project creation for another owner', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(setDoc(doc(alice.firestore(), 'projects', 'proj1'), {
        id: 'proj1',
        name: 'Project 1',
        client: 'Client A',
        budget: 1000,
        status: 'aktivní',
        startDate: '2026-01-01',
        ownerId: 'bob',
        createdAt: new Date(),
        updatedAt: new Date()
    }));
});

test('Should deny reading bob\'s project as alice', async () => {
    const bob = testEnv.authenticatedContext('bob');
    const alice = testEnv.authenticatedContext('alice');
    
    // Set bob's project via admin context if needed, or bob context
    await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'projects', 'bob_proj'), {
            ownerId: 'bob',
            name: 'Sensitive'
        });
    });

    await assertFails(getDoc(doc(alice.firestore(), 'projects', 'bob_proj')));
});
```
