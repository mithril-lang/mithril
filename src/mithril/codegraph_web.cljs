(ns mithril.codegraph-web
  "Loopback complete-index explorer. Requests are bound to one immutable snapshot."
  (:require [mithril.codegraph :as graph]
            [mithril.codegraph-fs :as local]
            [mithril.codegraph-contract :as contract]))

(def max-request-bytes 16384)
(defn serve! [root artifact rebuild?]
  (let [root (local/root! root)
        snapshot (atom (:snapshot (local/sync! root artifact {:rebuild? rebuild?})))
        read-asset #(.readFileSync local/fs (.resolve local/path-api contract/package-root
                                            (str "resources/codegraph/live." %)) "utf8")
        assets {"/" ["text/html; charset=utf-8" (read-asset "html")]
                "/live.js" ["text/javascript; charset=utf-8" (read-asset "js")]
                "/live.css" ["text/css; charset=utf-8" (read-asset "css")]}
        send! (fn [res status content-type body]
                (.writeHead res status #js {"Content-Type" content-type "Cache-Control" "no-store"
                                           "X-Content-Type-Options" "nosniff" "Referrer-Policy" "no-referrer"
                                           "Content-Security-Policy" "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"})
                (.end res body))
        json! #(send! %1 %2 "application/json; charset=utf-8" (.stringify js/JSON (clj->js %3)))
        body! (fn [req res action]
                (if (not= "application/json" (aget (.-headers req) "content-type"))
                  (json! res 415 {:error "json-required"})
                  (let [chunks (atom []) size (atom 0) rejected (atom false)]
                    (.on req "data" (fn [chunk]
                                       (when-not @rejected
                                         (if (> (swap! size + (.-length chunk)) max-request-bytes)
                                           (do (reset! rejected true) (reset! chunks [])
                                               (json! res 413 {:error "request-budget"}))
                                           (swap! chunks conj chunk)))))
                    (.on req "end"
                         (fn []
                           (when-not @rejected
                             (try
                               (let [text (.toString (.concat js/Buffer (clj->js @chunks)) "utf8")
                                     request (js->clj (js/JSON.parse text) :keywordize-keys true)]
                                 (json! res 200 (action request)))
                               (catch :default e
                                 (json! res (if (= :stale-revision (:reason (ex-data e))) 409 400)
                                        {:error (or (:reason (ex-data e)) :invalid-request)
                                         :message (.-message e) :snapshot-digest (:snapshot-digest @snapshot)})))))))))
        refresh! (fn [request]
                   (when-not (= {} request) (throw (ex-info "refresh takes no fields" {:reason :invalid-request})))
                   (let [result (local/sync! root artifact)]
                     (reset! snapshot (:snapshot result))
                     (assoc (:receipt result) :status (graph/dispatch @snapshot artifact {:operation "status"}))))
        server (.createServer (js/require "http")
                 (fn [req res]
                   (let [host (str "127.0.0.1:" (.-localPort (.-socket req)))
                         origin (aget (.-headers req) "origin")
                         valid? (and (= host (aget (.-headers req) "host"))
                                     (or (nil? origin) (= origin (str "http://" host))))
                         url (.-url req) method (.-method req)]
                     (cond
                       (not valid?) (json! res 403 {:error "loopback-origin-required"})
                       (and (= "GET" method) (contains? assets url))
                       (let [[type body] (get assets url)] (send! res 200 type body))
                       (and (= "POST" method) (= "/query" url))
                       (body! req res #(graph/dispatch @snapshot artifact %))
                       (and (= "POST" method) (= "/refresh" url)) (body! req res refresh!)
                       :else (json! res 404 {:error "unknown-route"})))))]
    (.setTimeout server 15000)
    (set! (.-requestTimeout server) 15000)
    (.listen server 0 "127.0.0.1"
             (fn [] (println (.stringify js/JSON
                               (clj->js {:url (str "http://127.0.0.1:" (.-port (.address server)))
                                         :snapshot-digest (:snapshot-digest @snapshot)
                                         :root root :mode "complete-index"})))))
    server))
