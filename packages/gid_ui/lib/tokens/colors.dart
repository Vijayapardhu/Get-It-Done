import 'package:flutter/material.dart';

/// GET IT DONE colour system.
///
/// Blue-first, but deliberately a *scale* rather than one flat blue: the app
/// reads as flat and cheap when every blue surface is the same value. Each step
/// has one job, documented below, and components reference the role rather than
/// the hex.
///
/// The neutrals are cool-tinted (a touch of blue in the grey) so they sit with
/// the primary instead of fighting it. Pure greys next to a saturated blue look
/// muddy.
abstract final class AppColors {
  // ── Primary blue scale ────────────────────────────────────────────────────
  // Deliberately a shade desaturated from a typical SaaS blue. This is a
  // cooperative service, and an over-saturated blue reads as fintech.

  /// Large section backgrounds — the "very light blue" feature areas.
  static const blue50 = Color(0xFFF0F5FF);

  /// Soft blue: service tile backgrounds, selected cards, icon containers.
  static const blue100 = Color(0xFFE0EAFF);

  /// Borders on blue surfaces, dividers inside blue sections.
  static const blue200 = Color(0xFFC7D9FE);

  /// Disabled primary, decorative strokes.
  static const blue300 = Color(0xFFA3C0FC);

  /// Secondary icon tint on blue backgrounds.
  static const blue400 = Color(0xFF7AA0F8);

  /// PRIMARY. Actions, active navigation, links, focus rings.
  static const blue500 = Color(0xFF4A7DF0);

  /// Pressed state, visited links, emphasis on light backgrounds.
  static const blue600 = Color(0xFF2E5FD9);

  static const blue700 = Color(0xFF2249AD);
  static const blue800 = Color(0xFF1B3A85);

  /// Dark navy — headings and primary text in light mode.
  static const blue900 = Color(0xFF14285C);

  // ── Neutrals (cool-tinted) ────────────────────────────────────────────────
  static const n0 = Color(0xFFFFFFFF);
  static const n50 = Color(0xFFF8FAFC);
  static const n100 = Color(0xFFF1F5F9);
  static const n200 = Color(0xFFE2E8F0);
  static const n300 = Color(0xFFCBD5E1);
  static const n400 = Color(0xFF94A3B8);
  static const n500 = Color(0xFF64748B);
  static const n600 = Color(0xFF475569);
  static const n700 = Color(0xFF334155);
  static const n800 = Color(0xFF1E293B);
  static const n900 = Color(0xFF0F172A);

  // ── Semantic ──────────────────────────────────────────────────────────────
  // Each has a strong value (text, icons, borders) and a soft value
  // (backgrounds). Never put strong-on-strong.

  /// Verified, completed, worker available.
  static const success = Color(0xFF16A34A);
  static const successSoft = Color(0xFFDCFCE7);
  static const successDark = Color(0xFF4ADE80);

  /// Emergency, cancel, destructive. Used sparingly — it must stay alarming.
  static const danger = Color(0xFFDC2626);
  static const dangerSoft = Color(0xFFFEE2E2);
  static const dangerDark = Color(0xFFF87171);

  /// Pending verification, expiring certification, delayed booking.
  static const warning = Color(0xFFD97706);
  static const warningSoft = Color(0xFFFEF3C7);
  static const warningDark = Color(0xFFFBBF24);

  // ── Dark mode ─────────────────────────────────────────────────────────────
  // Deep navy, never true black: black kills the soft-shadow depth the light
  // theme relies on, and OLED black next to blue looks like a void.

  static const darkBg = Color(0xFF0B1220);
  static const darkSurface = Color(0xFF131C2E);
  static const darkSurfaceAlt = Color(0xFF1B2740);
  static const darkBorder = Color(0xFF27354F);

  /// Brighter than blue500 — the light-mode primary fails contrast on navy.
  static const darkPrimary = Color(0xFF6D9BFF);
  static const darkPrimarySoft = Color(0xFF1C2C4D);

  static const darkTextPrimary = Color(0xFFF8FAFC);
  static const darkTextSecondary = Color(0xFF94A3B8);

  // ── Service accents ───────────────────────────────────────────────────────
  // Each service category gets a subtle tint so the grid has rhythm without
  // becoming a colour riot. Values are muted on purpose — saturated tiles make
  // the home screen look like a children's app.

  static const servicePlumbing = Color(0xFF3B82F6);
  static const servicePlumbingSoft = Color(0xFFE0EAFF);

  static const serviceElectrical = Color(0xFFF59E0B);
  static const serviceElectricalSoft = Color(0xFFFEF3C7);

  static const serviceCleaning = Color(0xFF14B8A6);
  static const serviceCleaningSoft = Color(0xFFD5F5F1);

  static const servicePainting = Color(0xFF8B5CF6);
  static const servicePaintingSoft = Color(0xFFEDE4FE);

  static const serviceCarpentry = Color(0xFFEA7C4B);
  static const serviceCarpentrySoft = Color(0xFFFBE8DE);

  static const serviceAppliance = Color(0xFF6366F1);
  static const serviceApplianceSoft = Color(0xFFE4E5FD);

  static const servicePest = Color(0xFF65A30D);
  static const servicePestSoft = Color(0xFFE8F3D4);

  static const serviceOther = blue500;
  static const serviceOtherSoft = blue100;

  /// Shadows are blue-tinted rather than neutral grey. It is a small thing and
  /// it is most of the difference between "flat" and "considered".
  static const shadowTint = Color(0xFF1B3A85);
}
