INSERT INTO users (id, name)
VALUES (1, 'Assessment User')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (name, sku, stock_qty, price)
VALUES
  ('Laptop Bag', 'SKU001', 100, 49.99),
  ('Wireless Mouse', 'SKU002', 80, 19.99),
  ('Mechanical Keyboard', 'SKU003', 50, 79.99)
ON CONFLICT (sku) DO NOTHING;
