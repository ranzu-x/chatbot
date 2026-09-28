<?php
/**
 * Plugin Name: Chatbot Cart Recovery
 * Description: Sends WooCommerce classic-checkout carts (customer phone + items) to your chatbot so abandoned-cart reminders can go out on WhatsApp / Messenger. Generated for one store connection — do not share this file.
 * Version: 1.0.0
 * Requires Plugins: woocommerce
 */

if (!defined('ABSPATH')) {
    exit;
}

define('CBCR_ENDPOINT', '{{ENDPOINT}}');
define('CBCR_SECRET', '{{SECRET}}');
define('CBCR_TTL', 7 * DAY_IN_SECONDS);

/** A stable key for this visitor's cart (WooCommerce session customer id). */
function cbcr_cart_key() {
    if (!function_exists('WC') || !WC()->session) {
        return null;
    }
    $key = WC()->session->get('cbcr_cart_key');
    if (!$key) {
        $key = wp_generate_password(20, false, false);
        WC()->session->set('cbcr_cart_key', $key);
    }
    return $key;
}

function cbcr_send($payload) {
    $body = wp_json_encode($payload);
    $signature = base64_encode(hash_hmac('sha256', $body, CBCR_SECRET, true));
    wp_remote_post(CBCR_ENDPOINT, array(
        'timeout'  => 5,
        'blocking' => false,
        'headers'  => array('Content-Type' => 'application/json', 'X-Chatbot-Signature' => $signature),
        'body'     => $body,
    ));
}

/**
 * Classic checkout: WooCommerce refreshes the order review whenever a billing
 * field changes, posting all fields. Once a phone is typed, the cart is sent.
 */
add_action('woocommerce_checkout_update_order_review', function ($posted) {
    parse_str($posted, $fields);
    $phone = isset($fields['billing_phone']) ? sanitize_text_field($fields['billing_phone']) : '';
    if ($phone === '' || !WC()->cart || WC()->cart->is_empty()) {
        return;
    }
    $key = cbcr_cart_key();
    if (!$key) {
        return;
    }
    $items = array();
    $restore = array();
    foreach (WC()->cart->get_cart() as $item) {
        $product = $item['data'];
        $items[] = array('name' => $product ? $product->get_name() : '', 'quantity' => (int) $item['quantity']);
        $restore[] = array('product_id' => (int) $item['product_id'], 'variation_id' => (int) $item['variation_id'], 'quantity' => (int) $item['quantity']);
    }
    set_transient('cbcr_cart_' . $key, $restore, CBCR_TTL);
    $name = trim((isset($fields['billing_first_name']) ? $fields['billing_first_name'] : '') . ' ' . (isset($fields['billing_last_name']) ? $fields['billing_last_name'] : ''));
    cbcr_send(array(
        'event'        => 'cart',
        'cart_key'     => $key,
        'name'         => sanitize_text_field($name),
        'phone'        => $phone,
        'email'        => isset($fields['billing_email']) ? sanitize_email($fields['billing_email']) : '',
        'total'        => (float) WC()->cart->get_total('edit'),
        'currency'     => get_woocommerce_currency(),
        'items'        => $items,
        'recovery_url' => add_query_arg('cbcr_restore', rawurlencode($key), wc_get_checkout_url()),
        'updated_at'   => gmdate('c'),
    ));
});

/** The cart became an order — no reminder for it. */
add_action('woocommerce_checkout_order_processed', function ($order_id) {
    if (!function_exists('WC') || !WC()->session) {
        return;
    }
    $key = WC()->session->get('cbcr_cart_key');
    if (!$key) {
        return;
    }
    cbcr_send(array('event' => 'completed', 'cart_key' => $key, 'order_id' => (string) $order_id));
    delete_transient('cbcr_cart_' . $key);
    WC()->session->set('cbcr_cart_key', null);
});

/** The reminder's link: puts the saved items back in the cart and opens checkout. */
add_action('wp_loaded', function () {
    if (empty($_GET['cbcr_restore']) || !function_exists('WC') || !WC()->cart) {
        return;
    }
    $key = sanitize_text_field(wp_unslash($_GET['cbcr_restore']));
    $saved = get_transient('cbcr_cart_' . $key);
    if (is_array($saved)) {
        WC()->cart->empty_cart();
        foreach ($saved as $line) {
            WC()->cart->add_to_cart($line['product_id'], max(1, $line['quantity']), $line['variation_id']);
        }
        if (WC()->session) {
            WC()->session->set('cbcr_cart_key', $key);
        }
    }
    wp_safe_redirect(wc_get_checkout_url());
    exit;
});
