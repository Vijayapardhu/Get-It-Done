import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import PDFDocument from "pdfkit";
import { PassThrough } from "node:stream";
import { rejectNonUuidParam } from "../middleware/uuidParams.js";

/**
 * @openapi
 * /invoices/{id}/pdf:
 *   get:
 *     summary: Download invoice PDF
 *     tags: [Invoices]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: PDF file }
 *       404: { description: Not found }
 *       403: { description: Forbidden }
 */

export const invoicesRouter = Router();

// Malformed ids 404 instead of reaching Postgres, which would raise
// "invalid input syntax for type uuid" and surface as a 500.
invoicesRouter.param("id", rejectNonUuidParam);

invoicesRouter.get("/:id/pdf", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`select i.*, b.address as booking_address, b.description as booking_description, b.scheduled_at,
       u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
       wu.name as worker_name, s.name as service_name, c.name as cooperative_name
       from invoices i
       join bookings b on b.id = i.booking_id
       join users u on u.id = i.customer_id
       join workers w on w.id = i.worker_id
       join users wu on wu.id = w.user_id
       join services s on s.id = i.service_id
       left join cooperatives c on c.id = w.cooperative_id
       where i.id = $1`, [req.params.id]);

    if (!result.rows[0]) { res.status(404).json({ error: "Invoice not found" }); return; }
    const invoice = result.rows[0];

    if (invoice.customer_id !== req.user!.id && invoice.worker_id !== req.user!.id && !["system_admin", "federation_admin", "society_admin", "support_staff"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const doc = new PDFDocument({ margin: 50 });
    const stream = new PassThrough();

    doc.pipe(stream);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);
    stream.pipe(res);

    // Header
    doc.fontSize(24).font("Helvetica-Bold").text("GET IT DONE", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).font("Helvetica").text("Invoice", { align: "center" });
    doc.moveDown(2);

    // Invoice details
    doc.fontSize(10).font("Helvetica-Bold").text("Invoice Details:");
    doc.font("Helvetica");
    doc.text(`Invoice Number: ${invoice.invoice_number}`);
    doc.text(`Issue Date: ${new Date(invoice.issued_at).toLocaleDateString()}`);
    doc.text(`Status: ${invoice.payment_status}`);
    doc.moveDown();

    // Customer details
    doc.font("Helvetica-Bold").text("Bill To:");
    doc.font("Helvetica");
    doc.text(invoice.customer_name);
    if (invoice.customer_email) doc.text(invoice.customer_email);
    if (invoice.customer_phone) doc.text(invoice.customer_phone);
    doc.moveDown();

    // Worker details
    doc.font("Helvetica-Bold").text("Service Provider:");
    doc.font("Helvetica");
    doc.text(invoice.worker_name);
    if (invoice.cooperative_name) doc.text(`Cooperative: ${invoice.cooperative_name}`);
    doc.moveDown();

    // Service details
    doc.font("Helvetica-Bold").text("Service Details:");
    doc.font("Helvetica");
    doc.text(`Service: ${invoice.service_name}`);
    doc.text(`Address: ${invoice.booking_address}`);
    doc.text(`Date: ${new Date(invoice.scheduled_at).toLocaleDateString()}`);
    doc.text(`Description: ${invoice.booking_description}`);
    doc.moveDown();

    // Line items table
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 300;
    const col3 = 400;
    const col4 = 500;

    doc.font("Helvetica-Bold");
    doc.text("Description", col1, tableTop);
    doc.text("Rate", col2, tableTop, { width: 80, align: "right" });
    doc.text("Qty", col3, tableTop, { width: 50, align: "center" });
    doc.text("Amount", col4, tableTop, { width: 60, align: "right" });
    doc.moveDown(0.5);

    doc.font("Helvetica");
    let y = doc.y;
    doc.text(invoice.service_name, col1, y);
    doc.text(`₹${Number(invoice.subtotal).toFixed(2)}`, col2, y, { width: 80, align: "right" });
    doc.text("1", col3, y, { width: 50, align: "center" });
    doc.text(`₹${Number(invoice.subtotal).toFixed(2)}`, col4, y, { width: 60, align: "right" });
    y += 20;

    if (Number(invoice.discount) > 0) {
      doc.text("Discount", col1, y);
      doc.text("", col2, y, { width: 80, align: "right" });
      doc.text("1", col3, y, { width: 50, align: "center" });
      doc.text(`-₹${Number(invoice.discount).toFixed(2)}`, col4, y, { width: 60, align: "right" });
      y += 20;
    }

    // Subtotal
    doc.moveDown();
    y = doc.y + 10;
    doc.font("Helvetica-Bold").text("Subtotal:", col2, y, { width: 150, align: "right" });
    doc.text(`₹${Number(invoice.subtotal - invoice.discount).toFixed(2)}`, col4, y, { width: 60, align: "right" });
    y += 20;

    // Tax
    doc.font("Helvetica").text(`GST (18%):`, col2, y, { width: 150, align: "right" });
    doc.text(`₹${Number(invoice.tax).toFixed(2)}`, col4, y, { width: 60, align: "right" });
    y += 20;

    // Platform fee
    doc.text("Platform Fee:", col2, y, { width: 150, align: "right" });
    doc.text(`₹${Number(invoice.platform_fee).toFixed(2)}`, col4, y, { width: 60, align: "right" });
    y += 20;

    // Cooperative share
    if (Number(invoice.cooperative_share) > 0) {
      doc.text("Cooperative Share:", col2, y, { width: 150, align: "right" });
      doc.text(`₹${Number(invoice.cooperative_share).toFixed(2)}`, col4, y, { width: 60, align: "right" });
      y += 20;
    }

    // Total
    doc.moveDown();
    y = doc.y + 10;
    doc.font("Helvetica-Bold").text("Total:", col2, y, { width: 150, align: "right" });
    doc.text(`₹${Number(invoice.total).toFixed(2)}`, col4, y, { width: 60, align: "right" });
    y += 30;

    // Footer
    doc.fontSize(8).font("Helvetica").text("Thank you for using GET IT DONE", { align: "center" });
    doc.text("This is a computer-generated invoice and does not require a signature.", { align: "center" });

    doc.end();
  } catch (error) { next(error); }
});