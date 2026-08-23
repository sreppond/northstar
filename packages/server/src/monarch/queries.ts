/**
 * The GraphQL documents, kept verbatim from Monarch's own web client.
 *
 * These are transcribed from the MonarchMoneyCommunity library, which captured
 * them from the app. Monarch's API is private and unversioned, so this file is
 * the thing most likely to rot: if a refresh starts failing with a GraphQL
 * validation error, recapture the query from DevTools (Network → any
 * api.monarch.com request → Payload) and update it here. Nothing else in the
 * server needs to change when that happens.
 */

/**
 * Note what this returns that the MCP server's `get_accounts` tool does not:
 * `subtype`, `interestRate`, `apr`, `minimumPayment` and `plannedPayment`.
 *
 * That matters more than it looks. `subtype` is the only field that separates a
 * 401(k) from a Roth from a taxable brokerage — the distinction the engine's
 * entire tax model turns on. Going direct means the import can classify those
 * automatically instead of asking, and it means the `linked*` provenance fields
 * on `Account` get real values.
 */
export const GET_ACCOUNTS = `
  query GetAccounts {
    accounts {
      ...AccountFields
      __typename
    }
  }

  fragment AccountFields on Account {
    id
    displayName
    deactivatedAt
    isHidden
    isAsset
    includeInNetWorth
    currentBalance
    displayBalance
    type { name display __typename }
    subtype { name display __typename }
    institution { id name __typename }
    apr
    interestRate
    minimumPayment
    plannedPayment
    __typename
  }
`;

export const GET_CASHFLOW = `
  query Web_GetCashFlowPage($filters: TransactionFilterInput) {
    summary: aggregates(filters: $filters, fillEmptyValues: true) {
      summary {
        sumIncome
        sumExpense
        savings
        savingsRate
        __typename
      }
      __typename
    }
  }
`;
