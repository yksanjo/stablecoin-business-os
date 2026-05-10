// AI Finance Assistant for Stablecoin Business OS
// Provides cashflow forecasting, transaction categorization, and insights

import { getDb } from '../services/database.js';

/**
 * Generate cashflow forecast based on historical data
 */
export async function generateCashflowForecast(businessId, months = 3) {
  const db = await getDb();

  // Get historical revenue (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const histStmt = db.prepare(`
    SELECT
      strftime('%Y-%m', created_at) as month,
      SUM(amount_usdc) as revenue
    FROM invoices
    WHERE business_id = ? AND status = 'paid' AND created_at >= ?
    GROUP BY month
    ORDER BY month
  `);
  histStmt.bind([businessId, sixMonthsAgo.toISOString()]);
  const historicalRevenue = [];
  while (histStmt.step()) {
    historicalRevenue.push(histStmt.getAsObject());
  }
  histStmt.free();

  // Get active subscriptions (recurring revenue)
  const subStmt = db.prepare(`
    SELECT COALESCE(SUM(amount_usdc), 0) as monthly_mrr
    FROM subscriptions
    WHERE business_id = ? AND status = 'active' AND frequency = 'monthly'
  `);
  subStmt.bind([businessId]);
  const subscriptions = [];
  while (subStmt.step()) {
    subscriptions.push(subStmt.getAsObject());
  }
  subStmt.free();
  const subData = subscriptions.length > 0 ? subscriptions[0] : { monthly_mrr: 0 };

  // Get pending payouts
  const payoutStmt = db.prepare(`
    SELECT COALESCE(SUM(amount_usdc), 0) as total
    FROM payouts
    WHERE business_id = ? AND status = 'pending'
  `);
  payoutStmt.bind([businessId]);
  const pendingPayouts = [];
  while (payoutStmt.step()) {
    pendingPayouts.push(payoutStmt.getAsObject());
  }
  payoutStmt.free();
  const payoutData = pendingPayouts.length > 0 ? pendingPayouts[0] : { total: 0 };

  // Get pending invoices (expected revenue)
  const invStmt = db.prepare(`
    SELECT COALESCE(SUM(amount_usdc), 0) as total
    FROM invoices
    WHERE business_id = ? AND status = 'sent'
  `);
  invStmt.bind([businessId]);
  const pendingInvoices = [];
  while (invStmt.step()) {
    pendingInvoices.push(invStmt.getAsObject());
  }
  invStmt.free();
  const invData = pendingInvoices.length > 0 ? pendingInvoices[0] : { total: 0 };

  // Calculate average monthly revenue
  const avgMonthlyRevenue = historicalRevenue.length > 0
    ? historicalRevenue.reduce((sum, row) => sum + row.revenue, 0) / historicalRevenue.length
    : 0;

  // Generate forecast
  const forecast = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthLabel = forecastDate.toISOString().slice(0, 7);

    const baseRevenue = subData.monthly_mrr || 0;
    const variableRevenue = avgMonthlyRevenue * 0.3;
    const expectedRevenue = baseRevenue + variableRevenue;

    forecast.push({
      month: monthLabel,
      expectedRevenue: Math.round(expectedRevenue * 100) / 100,
      baseRevenue: Math.round(baseRevenue * 100) / 100,
      variableRevenue: Math.round(variableRevenue * 100) / 100,
      confidence: i === 0 ? 'high' : i === 1 ? 'medium' : 'low',
    });
  }

  return {
    forecast,
    summary: {
      monthlyRecurringRevenue: Math.round((subData.monthly_mrr || 0) * 100) / 100,
      pendingPayouts: Math.round(payoutData.total * 100) / 100,
      pendingInvoices: Math.round(invData.total * 100) / 100,
      averageMonthlyRevenue: Math.round(avgMonthlyRevenue * 100) / 100,
      historicalMonths: historicalRevenue,
    },
    insights: generateInsights(historicalRevenue, subData, payoutData, invData),
  };
}

/**
 * Generate natural language insights
 */
function generateInsights(historicalRevenue, subscriptions, pendingPayouts, pendingInvoices) {
  const insights = [];
  const mrr = subscriptions?.monthly_mrr || 0;
  const pendingPayoutTotal = pendingPayouts.total || 0;
  const pendingInvoiceTotal = pendingInvoices.total || 0;

  if (mrr > 0) {
    insights.push({
      type: 'positive',
      message: `You have $${mrr.toFixed(2)} in monthly recurring revenue. This provides a stable base for growth.`,
    });
  } else {
    insights.push({
      type: 'opportunity',
      message: 'No recurring revenue yet. Consider adding subscription billing to stabilize cashflow.',
    });
  }

  if (pendingPayoutTotal > 0) {
    insights.push({
      type: 'action',
      message: `You have $${pendingPayoutTotal.toFixed(2)} in pending payouts. Process them to keep your team happy.`,
    });
  }

  if (pendingInvoiceTotal > 0) {
    insights.push({
      type: 'action',
      message: `You have $${pendingInvoiceTotal.toFixed(2)} in unpaid invoices. Send reminders to clients.`,
    });
  }

  if (historicalRevenue.length >= 3) {
    const recent = historicalRevenue.slice(-3);
    const trend = recent[recent.length - 1].revenue - recent[0].revenue;
    if (trend > 0) {
      insights.push({
        type: 'positive',
        message: `Revenue is trending upward ($${trend.toFixed(2)} increase over 3 months). Keep it up!`,
      });
    } else if (trend < 0) {
      insights.push({
        type: 'warning',
        message: `Revenue has declined by $${Math.abs(trend).toFixed(2)} over 3 months. Consider reviewing your pricing or acquisition strategy.`,
      });
    }
  }

  return insights;
}

/**
 * Categorize a transaction based on description
 */
export function categorizeTransaction(description) {
  const categories = {
    'revenue': ['sale', 'payment', 'invoice', 'subscription', 'license', 'fee', 'commission'],
    'payroll': ['salary', 'payroll', 'wage', 'contractor', 'freelancer'],
    'marketing': ['ads', 'marketing', 'social', 'promotion', 'influencer'],
    'infrastructure': ['hosting', 'server', 'api', 'saas', 'software', 'cloud'],
    'tools': ['tool', 'subscription', 'software license'],
    'tax': ['tax', 'vat', 'gst', 'withholding'],
    'transfer': ['transfer', 'withdrawal', 'deposit'],
  };

  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category;
    }
  }
  return 'other';
}

/**
 * Generate a financial health report
 */
export async function generateHealthReport(businessId) {
  const db = await getDb();

  const stmt = db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(amount_usdc), 0) FROM invoices WHERE business_id = ? AND status = 'paid') as total_revenue,
      (SELECT COALESCE(SUM(amount_usdc), 0) FROM payouts WHERE business_id = ? AND status IN ('pending', 'processing')) as pending_obligations,
      (SELECT COUNT(*) FROM invoices WHERE business_id = ? AND status = 'sent' AND due_date < datetime('now')) as overdue_invoices,
      (SELECT COUNT(*) FROM subscriptions WHERE business_id = ? AND status = 'active') as active_subscriptions
  `);
  stmt.bind([businessId, businessId, businessId, businessId]);
  const stats = [];
  while (stmt.step()) {
    stats.push(stmt.getAsObject());
  }
  stmt.free();
  const statData = stats.length > 0 ? stats[0] : { total_revenue: 0, pending_obligations: 0, overdue_invoices: 0, active_subscriptions: 0 };

  const score = calculateHealthScore(statData);

  return {
    score,
    grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
    stats: statData,
    recommendations: generateRecommendations(statData),
  };
}

function calculateHealthScore(stats) {
  let score = 50;

  if (stats.total_revenue > 10000) score += 20;
  else if (stats.total_revenue > 1000) score += 10;

  if (stats.pending_obligations === 0) score += 15;
  else if (stats.pending_obligations < stats.total_revenue * 0.3) score += 5;

  if (stats.overdue_invoices === 0) score += 10;

  if (stats.active_subscriptions >= 5) score += 15;
  else if (stats.active_subscriptions >= 1) score += 5;

  return Math.min(100, Math.max(0, score));
}

function generateRecommendations(stats) {
  const recs = [];
  if (stats.overdue_invoices > 0) {
    recs.push(`Follow up on ${stats.overdue_invoices} overdue invoice(s)`);
  }
  if (stats.active_subscriptions === 0) {
    recs.push('Add subscription billing to create recurring revenue');
  }
  if (stats.pending_obligations > stats.total_revenue * 0.5) {
    recs.push('Pending obligations exceed 50% of revenue — consider delaying non-essential payouts');
  }
  return recs;
}
