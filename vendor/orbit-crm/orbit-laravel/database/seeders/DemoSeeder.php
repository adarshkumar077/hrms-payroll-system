<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\Activity;
use App\Models\BankTransaction;
use App\Models\Contact;
use App\Models\Employee;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Item;
use App\Models\Lead;
use App\Models\LeaveApplication;
use App\Models\Opportunity;
use App\Models\Payment;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\Product;
use App\Models\Quotation;
use App\Models\QuotationLine;
use App\Models\Role;
use App\Models\SalaryStructure;
use App\Models\StockMove;
use App\Models\Tenant;
use App\Models\Ticket;
use App\Models\User;
use App\Models\VendorBill;
use App\Models\VendorBillLine;
use App\Models\Warehouse;
use App\Services\Compliance\GstService;
use App\Services\Compliance\PayrollService;
use App\Services\Ledger\GeneralLedgerService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Demo dataset for a fresh Orbit install — mirrors the shape/values of prisma/seed.ts
 * (the Next.js reference app) so a live UI demo has realistic data immediately.
 *
 * Seeds ONE tenant ("Acme Distributors Pvt Ltd") with a CEO login and a restricted
 * Sales login whose Role hides payslip.netPay, plus CRM/HR/Finance/Inventory records.
 */
class DemoSeeder extends Seeder
{
    private const HOME_STATE = 'Maharashtra';

    // Home-state GSTIN prefixes, roughly matching real state codes.
    private const STATE_GST_PREFIX = [
        'Maharashtra' => '27',
        'Gujarat' => '24',
        'Karnataka' => '29',
        'Delhi' => '07',
        'Tamil Nadu' => '33',
    ];

    public function run(): void
    {
        $this->wipeExisting();

        $tenant = Tenant::create([
            'id' => (string) Str::uuid(),
            'name' => 'Acme Distributors Pvt Ltd',
            'gstin' => '27AABCA1234A1Z5',
            'aato' => 80_000_000, // ₹8cr — above the ₹5cr e-invoice threshold
            'currency' => 'INR',
            'plan' => 'growth',
            'seats' => 10,
            'is_active' => true,
        ]);
        $tenantId = $tenant->id;

        // ── Roles + Users ──────────────────────────────────────────
        $ceoRole = Role::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'name' => 'CEO',
            'permissions' => '{}',
        ]);

        $salesRole = Role::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'name' => 'Sales',
            'permissions' => json_encode([
                'leads' => ['read', 'write'],
                'opportunities' => ['read', 'write'],
                'accounts' => ['read', 'write'],
                'quotations' => ['read', 'write'],
                'tickets' => ['read'],
                'payroll' => ['read'],
                '_fields' => ['payslip.netPay' => 'hidden'],
            ]),
        ]);

        $pw = Hash::make('orbit123');

        $ceo = User::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'name' => 'Ravi Sharma',
            'email' => 'ceo@demo.orbit',
            'password' => $pw,
            'role_id' => $ceoRole->id,
            'is_ceo' => true,
            'active' => true,
            'email_verified' => true,
        ]);

        $sales = User::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'name' => 'Priya Mehta',
            'email' => 'sales@demo.orbit',
            'password' => $pw,
            'role_id' => $salesRole->id,
            'is_ceo' => false,
            'active' => true,
            'email_verified' => true,
        ]);

        $reps = [$ceo, $sales];

        // ── Products ───────────────────────────────────────────────
        $productSpecs = [
            ['Industrial Router X1', '8517', 45000, 18],
            ['Smart Sensor Kit', '8536', 12000, 18],
            ['Annual Maintenance Contract', '9987', 25000, 18],
            ['Network Switch 24P', '8517', 32000, 18],
            ['Installation Service', '9987', 8000, 18],
        ];
        $products = [];
        foreach ($productSpecs as [$name, $hsn, $price, $tax]) {
            $products[] = Product::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'name' => $name,
                'sku' => strtoupper(substr($name, 0, 3)).self::randInt(999),
                'hsn' => $hsn,
                'unit_price' => $price,
                'tax_rate' => $tax,
            ]);
        }

        // ── Accounts + Contacts ────────────────────────────────────
        $accountSpecs = [
            ['Tata Retail', 'Retail', 'Mumbai', 'Maharashtra'],
            ['Reliance Digital', 'Retail', 'Ahmedabad', 'Gujarat'],
            ['Bajaj Traders', 'Manufacturing', 'Bengaluru', 'Karnataka'],
            ['Godrej Interio', 'Manufacturing', 'Delhi', 'Delhi'],
            ['Mahindra Logistics', 'Logistics', 'Pune', 'Maharashtra'],
        ];
        $accounts = [];
        foreach ($accountSpecs as [$name, $industry, $city, $state]) {
            $accounts[] = Account::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'name' => $name,
                'industry' => $industry,
                'city' => $city,
                'state' => $state,
                'gstin' => self::STATE_GST_PREFIX[$state].'AA'.self::randInt(9999).'Z'.self::randInt(9),
                'phone' => '022'.self::randInt(9999999),
                'email' => 'accounts@'.strtolower(explode(' ', $name)[0]).'.com',
            ]);
        }

        $contactNames = [
            ['Amit Kumar', 'Procurement Head'],
            ['Sneha Patel', 'IT Manager'],
            ['Rahul Singh', 'Director'],
            ['Neha Gupta', 'Procurement Head'],
        ];
        foreach ($contactNames as $i => [$name, $title]) {
            $acc = $accounts[$i % count($accounts)];
            Contact::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'account_id' => $acc->id,
                'name' => $name,
                'email' => 'contact'.$i.'@'.strtolower(explode(' ', $acc->name)[0]).'.com',
                'phone' => '98'.self::randInt(99999999),
                'title' => $title,
            ]);
        }

        // ── Leads (varied source/status/score) ────────────────────
        $sources = ['IndiaMART', 'JustDial', 'TradeIndia', 'Website', 'WhatsApp', 'Manual'];
        $statuses = ['New', 'Contacted', 'Qualified', 'Converted', 'Dead'];
        $leadFirstNames = ['Vikram', 'Anjali', 'Suresh', 'Divya', 'Karan', 'Nisha', 'Manoj', 'Priyanka'];
        $leadLastNames = ['Shah', 'Reddy', 'Nair', 'Gupta', 'Chawla', 'Bose'];
        for ($i = 0; $i < 8; $i++) {
            $source = $sources[$i % count($sources)];
            $status = $statuses[$i % count($statuses)];
            Lead::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'name' => self::pick($leadFirstNames).' '.self::pick($leadLastNames),
                'company' => self::pick($accounts)->name.' '.self::pick(['Branch', 'Unit', 'HO']),
                'email' => "lead{$i}@example.com",
                'phone' => '99'.self::randInt(99999999),
                'source' => $source,
                'status' => $status,
                'score' => $status === 'Dead' ? self::randInt(30) : (40 + self::randInt(60)),
                'score_reason' => $status === 'Dead' ? 'Low engagement, no response in 30 days' : "Active {$source} lead with recent activity",
                'owner_id' => self::pick($reps)->id,
            ]);
        }

        // ── Opportunities across stages (guaranteed one ClosedWon) ─
        $stages = ['Qualification', 'Proposal', 'Negotiation', 'ClosedWon', 'ClosedLost'];
        foreach ($stages as $stage) {
            $acc = self::pick($accounts);
            Opportunity::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'account_id' => $acc->id,
                'name' => "{$acc->name} — ".self::pick($products)->name,
                'amount' => (self::randInt(20) + 2) * 50000,
                'stage' => $stage,
                'probability' => $stage === 'ClosedWon' ? 100 : ($stage === 'ClosedLost' ? 0 : self::pick([20, 40, 60, 80])),
                'close_date' => now()->addDays(self::randInt(60) - 20),
                'owner_id' => self::pick($reps)->id,
            ]);
        }

        // ── Quotations ─────────────────────────────────────────────
        for ($i = 0; $i < 3; $i++) {
            $p = self::pick($products);
            $qty = self::randInt(5) + 1;
            $lineTotal = $p->unit_price * $qty;
            $taxTotal = round(($lineTotal * $p->tax_rate) / 100, 2);
            $q = Quotation::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'number' => 'QT-2026-'.(1000 + $i),
                'status' => ['Draft', 'Sent', 'Accepted'][$i % 3],
                'subtotal' => $lineTotal,
                'tax_total' => $taxTotal,
                'grand_total' => $lineTotal + $taxTotal,
            ]);
            QuotationLine::create([
                'id' => (string) Str::uuid(),
                'quotation_id' => $q->id,
                'product_id' => $p->id,
                'description' => $p->name,
                'qty' => $qty,
                'unit_price' => $p->unit_price,
                'tax_rate' => $p->tax_rate,
                'line_total' => $lineTotal,
            ]);
        }

        // ── Tickets (varied priority/status) ───────────────────────
        $ticketSpecs = [
            ['Router not connecting', 'Low', 'Open'],
            ['AMC renewal query', 'Medium', 'InProgress'],
            ['Installation pending', 'High', 'Resolved'],
            ['Invoice mismatch', 'Urgent', 'Closed'],
        ];
        foreach ($ticketSpecs as [$subject, $priority, $status]) {
            Ticket::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'account_id' => self::pick($accounts)->id,
                'subject' => $subject,
                'priority' => $priority,
                'status' => $status,
                'sla_due_at' => now()->addDays(self::randInt(5)),
                'owner_id' => self::pick($reps)->id,
            ]);
        }

        // ── Activities ─────────────────────────────────────────────
        $activitySpecs = [
            ['Task', 'Follow up on quote'],
            ['Call', 'Demo call'],
            ['Meeting', 'Contract review'],
            ['Task', 'Payment reminder'],
        ];
        foreach ($activitySpecs as [$type, $subject]) {
            Activity::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'type' => $type,
                'subject' => $subject,
                'due_date' => now()->addDays(self::randInt(10)),
                'done' => false,
                'owner_id' => self::pick($reps)->id,
            ]);
        }

        // ── HR: Employees + Salary structures ──────────────────────
        $employees = [];
        $employees[] = Employee::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'user_id' => $ceo->id,
            'code' => 'EMP100',
            'name' => $ceo->name,
            'email' => $ceo->email,
            'department' => 'Management',
            'designation' => 'CEO',
            'ctc' => 3_600_000,
            'date_of_joining' => '2023-04-01',
            'active' => true,
        ]);
        $employees[] = Employee::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'user_id' => $sales->id,
            'code' => 'EMP101',
            'name' => $sales->name,
            'email' => $sales->email,
            'department' => 'Sales',
            'designation' => 'Sales Lead',
            'ctc' => 720_000,
            'date_of_joining' => '2023-04-01',
            'active' => true,
        ]);

        $deps = ['Sales', 'Operations', 'Finance', 'Support'];
        $desigs = ['Executive', 'Manager', 'Associate', 'Sr. Executive'];
        $empNames = ['Arjun Rao', 'Meera Iyer', 'Rohit Verma', 'Kavya Menon'];
        foreach ($empNames as $i => $name) {
            $employees[] = Employee::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'code' => 'EMP'.(200 + $i),
                'name' => $name,
                'email' => strtolower(explode(' ', $name)[0]).'@acme.in',
                'department' => $deps[$i % count($deps)],
                'designation' => $desigs[$i % count($desigs)],
                'ctc' => (self::randInt(12) + 4) * 100000,
                'date_of_joining' => now()->subYears(self::randInt(3))->subDays(self::randInt(300)),
                'active' => true,
            ]);
        }

        $structures = [];
        foreach ($employees as $e) {
            $gross = round($e->ctc / 12);
            $s = PayrollService::suggestStructure((float) $gross);
            $structures[] = SalaryStructure::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'employee_id' => $e->id,
                'gross' => $s['gross'],
                'basic' => $s['basic'],
                'hra' => $s['hra'],
                'allowances' => $s['allowances'],
                'compliant' => $s['compliant'],
            ]);
        }

        // ── Leave applications (incl. one Pending) ─────────────────
        $leaveSpecs = [
            ['Casual', 'Pending', 'Personal'],
            ['Sick', 'Approved', 'Medical'],
            ['Earned', 'Rejected', 'Family function'],
        ];
        foreach ($leaveSpecs as $i => [$type, $status, $reason]) {
            $e = $employees[$i % count($employees)];
            $from = now()->addDays(self::randInt(20) - 5);
            LeaveApplication::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'employee_id' => $e->id,
                'type' => $type,
                'from_date' => $from,
                'to_date' => (clone $from)->addDays(self::randInt(3)),
                'days' => self::randInt(3) + 1,
                'status' => $status,
                'reason' => $reason,
            ]);
        }

        // ── Payroll run (Draft) with payslips ───────────────────────
        $run = PayrollRun::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'month' => 7,
            'year' => 2026,
            'status' => 'Draft',
        ]);
        $gt = 0.0;
        $nt = 0.0;
        $pf = 0.0;
        $esi = 0.0;
        $tds = 0.0;
        foreach ($structures as $s) {
            $c = PayrollService::computePayslip([
                'gross' => (float) $s->gross,
                'basic' => (float) $s->basic,
                'annualGross' => (float) $s->gross * 12,
            ]);
            Payslip::create([
                'id' => (string) Str::uuid(),
                'payroll_run_id' => $run->id,
                'employee_id' => $s->employee_id,
                'gross' => $c['gross'],
                'basic' => $c['basic'],
                'pf_employee' => $c['pfEmployee'],
                'pf_employer' => $c['pfEmployer'],
                'esi_employee' => $c['esiEmployee'],
                'esi_employer' => $c['esiEmployer'],
                'pt' => $c['pt'],
                'tds' => $c['tds'],
                'loss_of_pay' => $c['lossOfPay'],
                'net_pay' => $c['netPay'],
            ]);
            $gt += $c['gross'];
            $nt += $c['netPay'];
            $pf += $c['pfEmployee'] + $c['pfEmployer'];
            $esi += $c['esiEmployee'] + $c['esiEmployer'];
            $tds += $c['tds'];
        }
        $run->update([
            'gross_total' => $gt,
            'net_total' => $nt,
            'pf_total' => $pf,
            'esi_total' => $esi,
            'tds_total' => $tds,
        ]);
        // Status stays Draft on purpose (not locked/posted to GL yet) — mirrors the
        // real app's payroll flow where only a Locked run triggers postPayrollJournal.

        // ── Inventory: warehouses + items (2-3 below reorder level) ─
        $wh1 = Warehouse::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'name' => 'Main Warehouse',
            'location' => 'Bhiwandi, MH',
        ]);
        $wh2 = Warehouse::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'name' => 'South Regional Warehouse',
            'location' => 'Hosur, TN',
        ]);
        $warehouses = [$wh1, $wh2];

        // [productIndex|null, name, sku, hsn, onHand, reorderLevel, costPrice]
        $itemSpecs = [
            [0, null, null, null, 42, 15, null],
            [1, null, null, null, 8, 15, null],   // below reorder
            [2, null, null, null, 60, 15, null],
            [3, null, null, null, 12, 15, null],  // below reorder
            [4, null, null, null, 100, 15, null],
            [null, 'Cable Management Kit', 'CAB'.self::randInt(999), '8544', 5, 20, 300], // below reorder
            [null, 'Power Adapter 12V', 'PWR'.self::randInt(999), '8504', 75, 25, 450],
            [null, 'Rack Mount Bracket', 'RAC'.self::randInt(999), '7326', 30, 10, 600],
        ];
        foreach ($itemSpecs as $spec) {
            [$pIdx, $name, $sku, $hsn, $onHand, $reorder, $cost] = $spec;
            $product = $pIdx !== null ? $products[$pIdx] : null;
            $item = Item::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'product_id' => $product?->id,
                'name' => $product->name ?? $name,
                'sku' => $product->sku ?? $sku,
                'hsn' => $product->hsn ?? $hsn,
                'on_hand' => $onHand,
                'reorder_level' => $reorder,
                'cost_price' => $product ? round($product->unit_price * 0.7, 2) : $cost,
            ]);
            StockMove::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'item_id' => $item->id,
                'warehouse_id' => self::pick($warehouses)->id,
                'qty' => $onHand,
                'type' => 'GRN',
                'ref' => 'Opening',
            ]);
        }

        // ── Finance: GST invoices (mix of Draft/Finalized/Paid) ────
        $gl = new GeneralLedgerService();
        $invoiceStatuses = ['Draft', 'Finalized', 'Finalized', 'Paid'];
        foreach ($invoiceStatuses as $i => $status) {
            $acc = self::pick($accounts);
            $p = self::pick($products);
            $qty = self::randInt(6) + 1;
            $intraState = $acc->state === self::HOME_STATE;
            $g = GstService::computeGst([
                ['qty' => $qty, 'unitPrice' => $p->unit_price, 'taxRate' => $p->tax_rate],
            ], $intraState);
            $number = 'INV-2026-'.(500 + $i);
            $finalized = $status !== 'Draft';
            $needsIrn = $finalized && GstService::requiresEInvoice((float) $tenant->aato, 'B2B');

            $invoice = Invoice::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'account_id' => $acc->id,
                'number' => $number,
                'invoice_type' => 'B2B',
                'place_of_supply' => $acc->state,
                'subtotal' => $g['subtotal'],
                'cgst' => $g['cgst'],
                'sgst' => $g['sgst'],
                'igst' => $g['igst'],
                'grand_total' => $g['grandTotal'],
                'status' => $status,
                'irn' => $needsIrn ? GstService::mockIrn($number) : null,
                'ack_no' => $needsIrn ? (string) self::randInt(999999999) : null,
                'eway_bill_no' => $needsIrn && $g['grandTotal'] > 50000 ? (string) self::randInt(999999999999) : null,
            ]);
            InvoiceLine::create([
                'id' => (string) Str::uuid(),
                'invoice_id' => $invoice->id,
                'description' => $p->name,
                'hsn' => $p->hsn,
                'qty' => $qty,
                'unit_price' => $p->unit_price,
                'tax_rate' => $p->tax_rate,
                'line_total' => $g['subtotal'],
            ]);

            if ($finalized) {
                $gl->postInvoiceJournal($tenantId, [
                    'number' => $invoice->number,
                    'subtotal' => (float) $invoice->subtotal,
                    'cgst' => (float) $invoice->cgst,
                    'sgst' => (float) $invoice->sgst,
                    'igst' => (float) $invoice->igst,
                    'grandTotal' => (float) $invoice->grand_total,
                ]);
            }

            if ($status === 'Paid') {
                $payment = Payment::create([
                    'id' => (string) Str::uuid(),
                    'tenant_id' => $tenantId,
                    'invoice_id' => $invoice->id,
                    'amount' => $invoice->grand_total,
                    'method' => 'NEFT',
                    'reference' => 'DEMO-'.self::randInt(99999),
                    'receipt_no' => 'RCPT-2026-'.(1000 + $i),
                    'status' => 'Success',
                ]);
                $gl->postPaymentJournal($tenantId, [
                    'receiptNo' => $payment->receipt_no,
                    'amount' => (float) $payment->amount,
                    'method' => $payment->method,
                ]);
            }
        }

        // ── Vendor bills ────────────────────────────────────────────
        $vendorSpecs = [
            ['Ingram Micro', '27AAACI1234B1Z1', 'Draft'],
            ['Redington', '29AAACR5678C1Z2', 'Approved'],
            ['Supertron', '24AAACS9012D1Z3', 'Paid'],
        ];
        foreach ($vendorSpecs as $i => [$vendor, $gstin, $status]) {
            $p = self::pick($products);
            $qty = self::randInt(8) + 2;
            $subtotal = round($p->unit_price * 0.7 * $qty, 2);
            $tax = round(($subtotal * $p->tax_rate) / 100, 2);
            $bill = VendorBill::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'vendor' => $vendor,
                'gstin' => $gstin,
                'bill_number' => 'VB-2026-'.(300 + $i),
                'date' => now()->subDays(self::randInt(30)),
                'due_date' => now()->addDays(15),
                'subtotal' => $subtotal,
                'tax' => $tax,
                'total' => $subtotal + $tax,
                'status' => $status,
                'source' => 'manual',
            ]);
            VendorBillLine::create([
                'id' => (string) Str::uuid(),
                'vendor_bill_id' => $bill->id,
                'description' => $p->name.' (bulk purchase)',
                'hsn' => $p->hsn,
                'qty' => $qty,
                'unit_price' => round($p->unit_price * 0.7, 2),
                'tax_rate' => $p->tax_rate,
                'line_total' => $subtotal,
            ]);
        }

        // ── Bank transactions (credit/debit mix) ────────────────────
        $bankSpecs = [
            ['Customer payment — Tata Retail', 250000, 'credit'],
            ['Customer payment — Reliance Digital', 180000, 'credit'],
            ['Vendor payment — Ingram Micro', 95000, 'debit'],
            ['Salary payout — June 2026', 420000, 'debit'],
            ['Customer payment — Bajaj Traders', 132000, 'credit'],
        ];
        foreach ($bankSpecs as $i => [$desc, $amount, $direction]) {
            BankTransaction::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'date' => now()->subDays(self::randInt(20)),
                'description' => $desc,
                'amount' => $amount,
                'direction' => $direction,
                'reconciled' => $i % 2 === 0,
            ]);
        }

        $this->command?->info("Seeded tenant '{$tenant->name}' ({$tenantId}) with ".count($employees).' employees, '.count($accounts)." accounts.\n   Login: ceo@demo.orbit / orbit123 (CEO)\n   Login: sales@demo.orbit / orbit123 (restricted — payslip.netPay hidden)");
    }

    /**
     * Wipe any previously seeded demo tenant (idempotent re-runs of `php artisan db:seed`).
     * Deletes child rows before parents; safe no-op if no demo tenant exists yet.
     */
    private function wipeExisting(): void
    {
        $tenant = DB::table('tenants')->where('name', 'Acme Distributors Pvt Ltd')->first();
        if (! $tenant) {
            return;
        }
        $tenantId = $tenant->id;

        DB::table('journal_lines')->where('tenant_id', $tenantId)->delete();
        DB::table('journal_entries')->where('tenant_id', $tenantId)->delete();
        DB::table('ledger_accounts')->where('tenant_id', $tenantId)->delete();

        $invoiceIds = DB::table('invoices')->where('tenant_id', $tenantId)->pluck('id');
        DB::table('invoice_lines')->whereIn('invoice_id', $invoiceIds)->delete();
        DB::table('invoices')->where('tenant_id', $tenantId)->delete();

        $vendorBillIds = DB::table('vendor_bills')->where('tenant_id', $tenantId)->pluck('id');
        DB::table('vendor_bill_lines')->whereIn('vendor_bill_id', $vendorBillIds)->delete();
        DB::table('vendor_bills')->where('tenant_id', $tenantId)->delete();

        DB::table('payments')->where('tenant_id', $tenantId)->delete();
        DB::table('bank_transactions')->where('tenant_id', $tenantId)->delete();
        DB::table('stock_moves')->where('tenant_id', $tenantId)->delete();
        DB::table('items')->where('tenant_id', $tenantId)->delete();
        DB::table('purchase_orders')->where('tenant_id', $tenantId)->delete();
        DB::table('warehouses')->where('tenant_id', $tenantId)->delete();

        $payrollRunIds = DB::table('payroll_runs')->where('tenant_id', $tenantId)->pluck('id');
        DB::table('payslips')->whereIn('payroll_run_id', $payrollRunIds)->delete();
        DB::table('payroll_runs')->where('tenant_id', $tenantId)->delete();
        DB::table('salary_structures')->where('tenant_id', $tenantId)->delete();
        DB::table('leave_applications')->where('tenant_id', $tenantId)->delete();
        DB::table('attendances')->where('tenant_id', $tenantId)->delete();
        DB::table('employees')->where('tenant_id', $tenantId)->delete();

        DB::table('activities')->where('tenant_id', $tenantId)->delete();

        $quotationIds = DB::table('quotations')->where('tenant_id', $tenantId)->pluck('id');
        DB::table('quotation_lines')->whereIn('quotation_id', $quotationIds)->delete();
        DB::table('quotations')->where('tenant_id', $tenantId)->delete();

        DB::table('tickets')->where('tenant_id', $tenantId)->delete();
        DB::table('opportunities')->where('tenant_id', $tenantId)->delete();
        DB::table('leads')->where('tenant_id', $tenantId)->delete();
        DB::table('contacts')->where('tenant_id', $tenantId)->delete();
        DB::table('accounts')->where('tenant_id', $tenantId)->delete();
        DB::table('products')->where('tenant_id', $tenantId)->delete();

        DB::table('event_logs')->where('tenant_id', $tenantId)->delete();
        DB::table('notifications')->where('tenant_id', $tenantId)->delete();
        DB::table('attachments')->where('tenant_id', $tenantId)->delete();
        DB::table('subscriptions')->where('tenant_id', $tenantId)->delete();

        DB::table('users')->where('tenant_id', $tenantId)->delete();
        DB::table('roles')->where('tenant_id', $tenantId)->delete();
        DB::table('tenants')->where('id', $tenantId)->delete();
    }

    private static function randInt(int $n): int
    {
        return random_int(0, max(0, $n - 1));
    }

    /**
     * @template T
     * @param  array<int, T>  $arr
     * @return T
     */
    private static function pick(array $arr)
    {
        return $arr[self::randInt(count($arr))];
    }
}
