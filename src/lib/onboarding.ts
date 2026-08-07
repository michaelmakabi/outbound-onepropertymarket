// Client for the `onboarding` edge function (super-admin: accounts, consent,
// card capture, encrypted vault reveal, automatic charging). Reuses the app's bearer token.
import { tokenStore } from './api';

const BASE =
  (import.meta as any).env?.VITE_ONBOARDING_BASE ||
  ((import.meta as any).env?.VITE_API_BASE
    ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/onboarding')
    : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/onboarding');

async function callFn(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(BASE);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(opts.params || {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const onboarding = {
  accounts: () => callFn('accounts'),
  account: (slug: string) => callFn('account', { params: { slug } }),
  createAccount: (b: any) => callFn('create_account', { method: 'POST', body: b }),
  saveAuthorization: (b: any) => callFn('save_authorization', { method: 'POST', body: b }),
  setupLink: (b: any) => callFn('setup_link', { method: 'POST', body: b }),
  syncStripeCard: (workspace_slug: string) => callFn('sync_stripe_card', { method: 'POST', body: { workspace_slug } }),
  saveCardManual: (b: any) => callFn('save_card_manual', { method: 'POST', body: b }),
  revealCard: (vault_id: string) => callFn('reveal_card', { method: 'POST', body: { vault_id } }),
  markKeyed: (vault_id: string) => callFn('mark_keyed', { method: 'POST', body: { vault_id } }),
  // Automatic charging (super-admin)
  autochargeSettings: () => callFn('autocharge_settings'),
  autochargeSet: (b: any) => callFn('autocharge_set', { method: 'POST', body: b }),
  autochargeRunNow: () => callFn('autocharge_run', { method: 'POST' }),
};

// The canonical consent wording (Authorization Version v3).
// v3 is based on counsel's approved v2 text, with Sections 1, 3, and the Cardholder
// Acknowledgment revised to expressly authorize collection, encryption, storage, and
// retention of the card security code (CVV) on file — the behavior implemented in the
// `onboarding` edge function (save_card_manual / card_vault). Because this reintroduces
// CVV retention that counsel's v2 omitted, this variant should be confirmed with counsel.
// The exact snapshot shown to each signer is frozen server-side at signing time, so
// bumping this version never rewrites what a prior signer already agreed to.
// The `company` argument is accepted for call-site compatibility; the letterhead name
// is fixed as "1PropertyMarket".
export const AUTHORIZATION_VERSION = 'v3';
export const AUTHORIZATION_TEXT = (_company?: string) =>
  `1PropertyMarket
Payment Card Authorization & Recurring Billing Consent
Authorization Version: v3
1PropertyMarket (One Property Market)
16137 Biscayne Boulevard
North Miami Beach, Florida 33160

By signing below, I authorize 1PropertyMarket, also known as One Property Market ("1PropertyMarket," "Company," "we," "us," or "our"), together with its authorized payment processors and service providers, to maintain my payment card as a card on file and to charge that card in accordance with this authorization.

1. Authorization to Store Payment Information
I authorize 1PropertyMarket and its authorized payment service providers to securely collect, process, transmit, and store payment information reasonably necessary to maintain my payment card on file.
This information may include:

• cardholder name;
• billing address;
• payment card number or payment token;
• expiration date;
• card brand;
• last four digits of the card; and
• other payment-related information reasonably necessary to process authorized transactions.

A card security code, including CVV, CVC, CID, or similar verification information, may be collected and, with my express authorization, stored and retained on file together with my other payment information for the duration of my account.
I understand that retaining the card security code after authorization is not required by, and may differ from, standard payment-card industry practices and card-network rules. Having been so informed, I nonetheless expressly and voluntarily authorize and consent to 1PropertyMarket collecting, encrypting, storing, and retaining my card security code on file, in encrypted form, so that 1PropertyMarket can maintain my payment card on file and enter it into third-party platforms on my behalf as described in this authorization. I accept mutual responsibility for this arrangement, and this authorization to retain the card security code remains in effect until I revoke it in writing or the card is removed from my account.

2. Authorization for Recurring and Usage-Based Charges
I authorize 1PropertyMarket to automatically charge the payment card I place on file for amounts that become due in connection with my account, services, subscriptions, and usage.
I understand and agree that authorized charges may include:

• recurring subscription fees;
• platform fees;
• service fees;
• monthly or periodic account charges;
• usage-based charges;
• outbound calling charges;
• messaging and telecommunications charges;
• artificial intelligence and software usage;
• third-party platform costs;
• underlying hard costs incurred in connection with my account;
• applicable 1PropertyMarket service fees, markups, or margins;
• taxes and government-imposed fees;
• account adjustments;
• past-due balances; and
• other amounts authorized under my applicable service agreement, order form, pricing schedule, account dashboard, or other pricing disclosure.

I understand that the amount charged to my payment card may vary from transaction to transaction and from billing period to billing period based on my actual usage, services purchased, applicable pricing, and other authorized charges.
I authorize 1PropertyMarket to process these charges automatically without obtaining a separate signature or authorization from me before each individual transaction, except where applicable law requires otherwise.

3. Third-Party Platforms and Payment Card Entry
I understand and authorize that, when reasonably necessary to activate, operate, fund, manage, or maintain services requested for my account, authorized 1PropertyMarket personnel may provide or manually enter permitted payment card information into approved third-party service platforms on my behalf.
This may include Retell AI and other third-party providers used to provide calling, communications, artificial intelligence, software, telecommunications, payment-processing, or related services.
I expressly authorize 1PropertyMarket personnel to enter my permitted payment information into such third-party platforms when necessary to establish or maintain services for my account.
Third-party platforms may process or retain permitted payment information in accordance with their own security practices, contractual obligations, privacy policies, payment-card requirements, and applicable law.
As set out in Section 1, I expressly authorize 1PropertyMarket personnel to store and retain my card security code on file in encrypted form and to enter it, together with my other permitted payment information, into approved third-party platforms (including Retell AI) when necessary to establish or maintain services for my account.

4. Cardholder Representations and Responsibilities
By signing this authorization, I represent, warrant, acknowledge, and agree that:

1. I am the lawful cardholder or am otherwise authorized by the cardholder and account owner to use the payment card provided.
2. I have authority to authorize recurring, automatic, and variable usage-based charges to the card.
3. The payment and billing information I provided is accurate and complete.
4. I will promptly update my payment information if my card expires, is replaced, changes, or is no longer authorized for use.
5. Charges processed in accordance with this authorization are authorized transactions.
6. I am responsible for amounts properly incurred through my account.
7. I am responsible for authorized usage of my account by employees, contractors, representatives, agents, or other persons to whom I provide access.
8. I will promptly notify 1PropertyMarket if I believe a billing error or unauthorized transaction has occurred.

Nothing in this authorization limits or waives any non-waivable rights available to me under applicable law or applicable payment-card network rules.

5. Declined, Failed, or Reversed Payments
If a payment is declined, rejected, reversed, returned, or otherwise unsuccessful, I authorize 1PropertyMarket to retry the payment method on file to the extent permitted by applicable law and applicable payment-card network rules.
A failed payment does not eliminate my obligation to pay amounts properly incurred and owed.
1PropertyMarket may suspend, limit, or terminate services for unpaid balances in accordance with the applicable service agreement and applicable law.

6. Duration of Authorization
This authorization remains effective until the earliest of:

• my valid revocation of this authorization;
• termination of the applicable payment authorization;
• termination of the applicable services; or
• the time at which 1PropertyMarket no longer has a lawful business need to maintain the payment method.

Revocation does not affect charges or obligations incurred before the revocation becomes effective.

7. Revocation of Authorization
I may revoke this payment authorization by providing written notice to 1PropertyMarket.
Written notice may be sent to:
1PropertyMarket (One Property Market)
16137 Biscayne Boulevard
North Miami Beach, Florida 33160
Email: support@1propertymarket.com
1PropertyMarket may also provide an account-based payment-management or cancellation method.
Revocation applies prospectively only and does not cancel, reverse, or eliminate charges properly incurred or authorized before the revocation becomes effective.
I understand that if an active payment method is required for the services I use, revoking this authorization may result in suspension or termination of those services.

8. Electronic Signature and Electronic Records
I consent to conducting this transaction electronically and to the use of electronic records and electronic signatures.
By entering my legal name, providing or drawing my electronic signature, and submitting this authorization, I intend to electronically sign this authorization and agree to be legally bound by it.
I authorize 1PropertyMarket to maintain records associated with this authorization, which may include:

• my legal name;
• my company or account name;
• my electronic signature;
• date and time of authorization;
• IP address;
• browser information;
• device information;
• session information;
• authorization version;
• the exact authorization text presented to me;
• transaction information;
• account information; and
• other technical or business records reasonably necessary to document my authorization.

I understand that 1PropertyMarket may preserve an immutable or historical copy of the authorization language that I agreed to so that future updates to the authorization do not alter the record of what I originally signed.

9. Privacy and Payment Data
Payment, billing, account, and authorization information will be handled in accordance with 1PropertyMarket's applicable Privacy Policy, Payment Data Privacy & Security Notice, contractual obligations, payment-industry requirements, and applicable law.
1PropertyMarket may disclose permitted payment information to service providers when reasonably necessary to process authorized payments or provide services requested for my account.
Such providers may include:

• payment processors;
• payment gateways;
• financial institutions;
• payment card networks;
• fraud-prevention providers;
• billing providers;
• Retell AI;
• telecommunications providers;
• software providers;
• artificial intelligence providers;
• hosting and infrastructure providers; and
• other service providers reasonably necessary to operate my account.

10. Governing Law
Except where prohibited or superseded by applicable federal or state law, this authorization will be governed by the laws of the State of Florida, without regard to its conflict-of-laws principles.
Nothing in this provision waives any consumer, privacy, payment, contractual, or statutory rights that cannot lawfully be waived.

CARDHOLDER ACKNOWLEDGMENT
By signing below, I acknowledge that:

• I have read this Payment Card Authorization & Recurring Billing Consent;
• I understand its terms;
• I authorize 1PropertyMarket to maintain my payment card on file;
• I expressly authorize 1PropertyMarket to store and retain my card security code (CVV) on file in encrypted form, as described in Sections 1 and 3;
• I authorize recurring charges;
• I authorize variable usage-based charges;
• I authorize approved payment information, including my card security code, to be provided or entered into third-party platforms when necessary to provide services for my account; and
• I agree to be legally bound by this authorization.

Authorization Version: v3`;
