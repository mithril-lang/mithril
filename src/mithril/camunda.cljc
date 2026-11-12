(ns mithril.camunda
  "Camunda-compatible execution facade over mithril.bpmn.

  This namespace is the executable counterpart of the API-compat shim
  design (mithril-fund docs/design/kyber-camunda-compat.md). Camunda
  clients talk to the shim; the shim calls these pure functions; nothing
  here performs I/O, clocks, or expression evaluation.

  Model:
  - A deployment registers one governed BPMN process version under a
    definition key. Versions increment. The compiled artifact is
    mithril.bpmn/compile-process output, so every Camunda restriction
    (one start/end, exclusive gateways, service-task coverage, explicit
    action-equality conditions) is enforced at deploy time.
  - A process instance owns one mithril.bpmn runtime. Token movement uses
    only select-action / apply-outcome; the shim never advances state on
    HTTP alone. Completed receipts advance; failed receipts restore the
    prior gateway for bounded retry.
  - Jobs, user tasks and messages are projections over
    bpmn/enabled-action-ids. A Camunda type/topic/messageName MUST equal
    the bound Mithril action id it claims; anything else is refused with
    a Camunda-typed error, never executed.
  - Errors carry both codes: :mithril/error (engine cause) and
    :camunda/type (:INVALID_ARGUMENT :CONFLICT :NOT_FOUND
    :NOT_IMPLEMENTED) so the shim can render Camunda-shaped HTTP."

  (:require [clojure.string :as str]
            [mithril.bpmn :as bpmn]
            [mithril.execution :as execution]))

(def definition-format "https://mithril.fund/artifact/camunda-definition-v1")
(def instance-format "https://mithril.fund/state/camunda-instance-v1")
(def receipt-format "https://mithril.fund/receipt/camunda-operation-v1")

(def empty-store
  {:camunda/seq 0
   :camunda/definitions {}
   :camunda/instances {}})

(defn- fail! [camunda-type mithril-code detail data]
  (throw (ex-info detail (merge {:camunda/type camunda-type
                                :mithril/error mithril-code
                                :detail detail}
                               data))))

(defn- blank? [s] (or (not (string? s)) (str/blank? s)))

(defn- next-seq [store]
  (let [n (inc (:camunda/seq store 0))]
    [(assoc store :camunda/seq n) n]))

(defn- short-digest [value]
  (subs (execution/digest value) 7 15))

(defn- get-definition-entry [store definition-key]
  (get-in store [:camunda/definitions definition-key]))

(defn- require-definition!
  [store definition-key version]
  (let [entry (get-definition-entry store definition-key)]
    (when-not entry
      (fail! :NOT_FOUND :mithril.camunda/unknown-definition
             "process definition key is unknown"
             {:definition-key definition-key}))
    (let [versions (:versions entry)
          picked (if (some? version)
                   (first (filter #(= version (:version %)) versions))
                   (last versions))]
      (when-not picked
        (fail! :NOT_FOUND :mithril.camunda/unknown-definition-version
               "process definition version is unknown"
               {:definition-key definition-key :version version}))
      picked)))

(defn- get-instance! [store instance-key]
  (let [inst (get-in store [:camunda/instances instance-key])]
    (when-not inst
      (fail! :NOT_FOUND :mithril.camunda/unknown-instance
             "process instance key is unknown"
             {:instance-key instance-key}))
    inst))

(defn- require-active! [inst op]
  (when-not (= :active (:status inst))
    (fail! :CONFLICT :mithril.camunda/instance-not-active
           (str "instance is not active for " op)
           {:instance-key (:key inst) :status (:status inst) :op op})))

(defn- wrap-bpmn [f camunda-fallback]
  (try (f)
       (catch :default e
         (let [data (ex-data e)
               code (:mithril/error data)]
           (throw (ex-info (or (:detail data) (ex-message e))
                           (assoc data
                                  :camunda/type
                                  (cond
                                    (contains? #{:mithril.bpmn/effect-in-flight
                                                 :mithril.bpmn/receipt-mismatch} code)
                                    :CONFLICT
                                    (contains? #{:mithril.bpmn/action-not-enabled} code)
                                    :INVALID_ARGUMENT
                                    :else camunda-fallback))))))))

(defn- append-receipt [inst op actor input-digest output n]
  (update inst :receipts (fnil conj [])
          {:format receipt-format
           :key (str "rc-" (short-digest [(:key inst) op n]))
           :op op
           :actor actor
           :input-digest input-digest
           :output-digest output
           :seq n}))

(defn deploy
  "Register a governed BPMN process doc under definition-key.
  Returns {:store :deployment :definition}. Versions start at 1."
  [store {:keys [definition-key doc action-by-id policy-action-ids
                 allow-singleton?] :as args}]
  (when (blank? definition-key)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-definition-key
           "definition-key must be a non-blank string" {:args (keys args)}))
  (when-not (map? doc)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-document
           "doc must be a BPMN process map" {:definition-key definition-key}))
  (when-not (map? action-by-id)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-action-catalog
           "action-by-id must be a map" {:definition-key definition-key}))
  (when-not (and (sequential? policy-action-ids) (seq policy-action-ids))
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-policy-actions
           "policy-action-ids must be a non-empty sequence"
           {:definition-key definition-key}))
  (let [compiled (wrap-bpmn
                  #(bpmn/compile-process doc action-by-id
                                         (vec policy-action-ids)
                                         (boolean allow-singleton?))
                  :INVALID_ARGUMENT)
        [store1 n] (next-seq store)
        entry (get-definition-entry store1 definition-key)
        version (if entry (inc (:latest entry)) 1)
        definition {:format definition-format
                    :definition-key definition-key
                    :version version
                    :id (str definition-key ":v" version)
                    :digest (:digest compiled)
                    :ontology (:ontology compiled)
                    :compiled compiled
                    :deployed-seq n}
        store2 (assoc-in store1 [:camunda/definitions definition-key]
                         {:key definition-key
                          :latest version
                          :versions (conj (vec (:versions entry [])) definition)})]
    {:store store2
     :deployment {:key (str "dep-" (short-digest [definition-key version n]))
                  :definition-key definition-key
                  :version version
                  :definition-id (:id definition)
                  :digest (:digest definition)}
     :definition definition}))

(defn definition
  "Read a deployed definition (latest when :version is nil)."
  [store definition-key & [{:keys [version]}]]
  (require-definition! store definition-key version))

(defn start-instance
  "Start an instance of a deployed definition version.
  Variables are caller declarations (unverified), never expressions."
  [store {:keys [definition-key version business-key variables caller] :as args}]
  (when (blank? caller)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-caller
           "caller must be a non-blank string" {:args (keys args)}))
  (let [definition (require-definition! store definition-key version)
        vars (or variables {})
        _ (when-not (map? vars)
            (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-variables
                   "variables must be a map" {:definition-key definition-key}))
        [store1 n] (next-seq store)
        runtime (bpmn/start-state (:compiled definition))
        instance-key (str "pi-" (short-digest [(:id definition)
                                               (or business-key "")
                                               vars n]))
        inst {:format instance-format
              :key instance-key
              :definition-key definition-key
              :definition-id (:id definition)
              :version (:version definition)
              :definition-digest (:digest definition)
              :business-key business-key
              :status :active
              :runtime runtime
              :jobs {}
              :tasks {}
              :receipts [{:format receipt-format
                           :key (str "rc-" (short-digest [instance-key :start n]))
                           :op :start
                           :actor caller
                           :input-digest (execution/digest
                                          {:definition (:id definition)
                                           :variables vars})
                           :output-digest (:digest definition)
                           :seq n}]}]
    {:store (assoc-in store1 [:camunda/instances instance-key] inst)
     :instance (assoc inst :enabled-actions (bpmn/enabled-action-ids runtime))}))

(defn instance
  "Read an instance with its currently enabled actions."
  [store instance-key]
  (let [inst (get-instance! store instance-key)]
    (assoc inst :enabled-actions (if (= :active (:status inst))
                                   (bpmn/enabled-action-ids (:runtime inst))
                                   []))))

(defn cancel-instance
  "Terminally cancel an active instance. Token state is frozen, not deleted."
  [store {:keys [instance-key caller reason]}]
  (when (blank? caller)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-caller
           "caller must be a non-blank string" {:instance-key instance-key}))
  (let [inst (get-instance! store instance-key)]
    (require-active! inst "cancel")
    (let [[store1 n] (next-seq store)
          inst1 (-> inst
                    (assoc :status :cancelled)
                    (append-receipt :cancel caller
                                    (execution/digest {:instance instance-key})
                                    (execution/digest {:status :cancelled
                                                       :reason (or reason "")})
                                    n))]
      {:store (assoc-in store1 [:camunda/instances instance-key] inst1)
       :instance inst1})))

(defn activate-jobs
  "Camunda jobs activation + C7 fetchAndLock.
  :type filters by bound action id; nil means all enabled."
  [store {:keys [instance-key type max-jobs worker-id] :as args}]
  (when (blank? worker-id)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-worker
           "worker-id must be a non-blank string" {:args (keys args)}))
  (let [inst (get-instance! store instance-key)]
    (require-active! inst "activate-jobs")
    (when (:pending (:runtime inst))
      (fail! :CONFLICT :mithril.bpmn/effect-in-flight
             "a BPMN service task is already pending" {:instance-key instance-key}))
    (let [n (int (or max-jobs 10))]
      (when-not (<= 1 n 100)
        (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-max-jobs
               "max-jobs must be within 1..100" {:instance-key instance-key :max-jobs max-jobs}))
      (let [enabled (bpmn/enabled-action-ids (:runtime inst))
            wanted (cond->> enabled (some? type) (filter #(= type %)))
            _ (when (and (some? type) (empty? wanted))
                (fail! :INVALID_ARGUMENT :mithril.bpmn/action-not-enabled
                       "job type is not enabled by the BPMN token state"
                       {:instance-key instance-key :type type}))
            [store1 s0] (next-seq store)
            [jobs store2] (reduce
                           (fn [[acc st] action]
                             (let [[st1 s] (next-seq st)
                                   key (str "job-" (short-digest [instance-key action s]))]
                               [(conj acc {:key key
                                            :kind :job
                                            :type action
                                            :instance-key instance-key
                                            :worker-id worker-id
                                            :retries 3
                                            :status :locked
                                            :created-seq s})
                                st1]))
                           [[] store1]
                           (take n wanted))
            inst1 (update inst :jobs (fnil merge {}) (into {} (map (juxt :key identity) jobs)))
            store3 (assoc-in store2 [:camunda/instances instance-key] inst1)]
        {:store store3 :jobs jobs}))))

(defn- find-job! [inst job-key]
  (let [job (get-in inst [:jobs job-key])]
    (when-not job
      (fail! :NOT_FOUND :mithril.camunda/unknown-job
             "job key is unknown for this instance"
             {:instance-key (:key inst) :job-key job-key}))
    job))

(defn complete-job
  "Camunda jobs completion + C7 external-task complete."
  [store {:keys [instance-key job-key worker-id variables]}]
  (when (blank? worker-id)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-worker
           "worker-id must be a non-blank string" {:instance-key instance-key}))
  (let [inst (get-instance! store instance-key)]
    (require-active! inst "complete-job")
    (let [job (find-job! inst job-key)]
      (when (and (:worker-id job) (not= worker-id (:worker-id job)))
        (fail! :CONFLICT :mithril.camunda/job-locked
               "job is locked by another worker"
               {:job-key job-key :locked-by (:worker-id job)}))
      (when-not (= :locked (:status job))
        (fail! :CONFLICT :mithril.camunda/job-not-locked
               "job is not completable in its status"
               {:job-key job-key :status (:status job)}))
      (let [vars (or variables {})
            _ (when-not (map? vars)
                (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-variables
                       "variables must be a map" {:job-key job-key}))
            runtime1 (wrap-bpmn
                      #(bpmn/select-action (:runtime inst) (:type job))
                      :CONFLICT)
            runtime2 (wrap-bpmn
                      #(bpmn/apply-outcome runtime1 (:type job) true)
                      :CONFLICT)
            done? (bpmn/completed? runtime2)
            [store1 n] (next-seq store)
            job1 (assoc job :status :completed :completed-seq n)
            inst1 (-> inst
                      (assoc :runtime runtime2)
                      (assoc-in [:jobs job-key] job1)
                      (append-receipt :complete-job worker-id
                                      (execution/digest {:job job-key :variables vars})
                                      (execution/digest {:enabled (bpmn/enabled-action-ids runtime2)})
                                      n)
                      (cond-> done? (assoc :status :completed)))]
        {:store (assoc-in store1 [:camunda/instances instance-key] inst1)
         :job job1
         :instance (assoc inst1 :enabled-actions (if done? [] (bpmn/enabled-action-ids runtime2)))}))))

(defn fail-job
  "Camunda jobs failure + C7 external-task failure. Restores the gateway."
  [store {:keys [instance-key job-key worker-id retries-left]}]
  (when (blank? worker-id)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-worker
           "worker-id must be a non-blank string" {:instance-key instance-key}))
  (let [inst (get-instance! store instance-key)]
    (require-active! inst "fail-job")
    (let [job (find-job! inst job-key)
          runtime (:runtime inst)
          pending (:pending runtime)
          runtime1 (if (and pending (= (:type job) (:action pending)))
                     (wrap-bpmn
                      #(bpmn/apply-outcome runtime (:type job) false)
                      :CONFLICT)
                     runtime)
          left (if (some? retries-left) (int retries-left) (dec (:retries job 1)))
          _ (when-not (<= 0 left 10)
              (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-retries
                     "retries-left must be within 0..10" {:job-key job-key}))
          [store1 n] (next-seq store)
          job1 (assoc job :status (if (zero? left) :exhausted :locked)
                      :retries left)
          inst1 (-> inst
                    (assoc :runtime runtime1)
                    (assoc-in [:jobs job-key] job1)
                    (append-receipt :fail-job worker-id
                                    (execution/digest {:job job-key})
                                    (execution/digest {:retries left})
                                    n)
                    (cond-> (zero? left) (assoc :status :incident)))]
      {:store (assoc-in store1 [:camunda/instances instance-key] inst1)
       :job job1
       :instance (assoc inst1 :enabled-actions (bpmn/enabled-action-ids runtime1))})))

(defn- user-task-key [instance-key action]
  (str "ut-" (short-digest [instance-key action])))

(defn search-user-tasks
  "Camunda user-task search + C7 task query (read-only projection)."
  [store {:keys [instance-key assignee-only caller]}]
  (let [inst (get-instance! store instance-key)]
    (require-active! inst "search-user-tasks")
    (let [enabled (bpmn/enabled-action-ids (:runtime inst))]
      {:instance-key instance-key
       :tasks (cond->> (mapv (fn [action]
                               (let [key (user-task-key instance-key action)
                                     rec (get-in inst [:tasks key])]
                                 {:key key
                                  :action action
                                  :instance-key instance-key
                                  :assignee (:assignee rec)
                                  :status (or (:status rec) :unclaimed)}))
                             enabled)
                assignee-only (filter #(= caller (:assignee %))))})))

(defn claim-user-task
  "Camunda claim + C7 task claim."
  [store {:keys [instance-key task-key caller]}]
  (when (blank? caller)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-caller
           "caller must be a non-blank string" {:instance-key instance-key}))
  (let [inst (get-instance! store instance-key)]
    (require-active! inst "claim-user-task")
    (let [enabled (set (bpmn/enabled-action-ids (:runtime inst)))
          action (some #(when (= (user-task-key instance-key %) task-key) %) enabled)]
      (when-not action
        (fail! :INVALID_ARGUMENT :mithril.bpmn/action-not-enabled
               "user task is not enabled by the BPMN token state"
               {:instance-key instance-key :task-key task-key}))
      (let [[store1 n] (next-seq store)
            task {:key task-key :kind :user-task :action action
                  :instance-key instance-key :assignee caller
                  :status :claimed :claimed-seq n}
            inst1 (-> inst
                      (assoc-in [:tasks task-key] task)
                      (append-receipt :claim-task caller
                                      (execution/digest {:task task-key})
                                      (execution/digest {:assignee caller}) n))]
        {:store (assoc-in store1 [:camunda/instances instance-key] inst1)
         :task task}))))

(defn complete-user-task
  "Camunda user-task completion + C7 task complete."
  [store {:keys [instance-key task-key caller variables]}]
  (when (blank? caller)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-caller
           "caller must be a non-blank string" {:instance-key instance-key}))
  (let [inst (get-instance! store instance-key)]
    (require-active! inst "complete-user-task")
    (let [task (get-in inst [:tasks task-key])]
      (when-not task
        (fail! :NOT_FOUND :mithril.camunda/unknown-task
               "user task key is unknown for this instance"
               {:instance-key instance-key :task-key task-key}))
      (when (and (:assignee task) (not= caller (:assignee task)))
        (fail! :CONFLICT :mithril.camunda/task-assigned
               "user task is claimed by another principal"
               {:task-key task-key :assignee (:assignee task)}))
      (let [vars (or variables {})
            _ (when-not (map? vars)
                (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-variables
                       "variables must be a map" {:task-key task-key}))
            runtime1 (wrap-bpmn
                      #(bpmn/select-action (:runtime inst) (:action task))
                      :CONFLICT)
            runtime2 (wrap-bpmn
                      #(bpmn/apply-outcome runtime1 (:action task) true)
                      :CONFLICT)
            done? (bpmn/completed? runtime2)
            [store1 n] (next-seq store)
            task1 (assoc task :status :completed :completed-seq n)
            inst1 (-> inst
                      (assoc :runtime runtime2)
                      (assoc-in [:tasks task-key] task1)
                      (append-receipt :complete-task caller
                                      (execution/digest {:task task-key :variables vars})
                                      (execution/digest {:enabled (bpmn/enabled-action-ids runtime2)})
                                      n)
                      (cond-> done? (assoc :status :completed)))]
        {:store (assoc-in store1 [:camunda/instances instance-key] inst1)
         :task task1
         :instance (assoc inst1 :enabled-actions (if done? [] (bpmn/enabled-action-ids runtime2)))}))))

(defn correlate-message
  "Camunda message correlation. :message-name MUST equal the enabled action."
  [store {:keys [instance-key message-name caller variables]}]
  (when (blank? caller)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-caller
           "caller must be a non-blank string" {:instance-key instance-key}))
  (when (blank? message-name)
    (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-message
           "message-name must be a non-blank string" {:instance-key instance-key}))
  (let [inst (get-instance! store instance-key)]
    (require-active! inst "correlate-message")
    (let [enabled (set (bpmn/enabled-action-ids (:runtime inst)))]
      (when-not (contains? enabled message-name)
        (fail! :INVALID_ARGUMENT :mithril.bpmn/action-not-enabled
               "message is not enabled by the BPMN token state"
               {:instance-key instance-key :message-name message-name}))
      (let [vars (or variables {})
            _ (when-not (map? vars)
                (fail! :INVALID_ARGUMENT :mithril.camunda/invalid-variables
                       "variables must be a map" {:instance-key instance-key}))
            runtime1 (wrap-bpmn
                      #(bpmn/select-action (:runtime inst) message-name)
                      :CONFLICT)
            runtime2 (wrap-bpmn
                      #(bpmn/apply-outcome runtime1 message-name true)
                      :CONFLICT)
            done? (bpmn/completed? runtime2)
            [store1 n] (next-seq store)
            inst1 (-> inst
                      (assoc :runtime runtime2)
                      (append-receipt :correlate-message caller
                                      (execution/digest {:message message-name :variables vars})
                                      (execution/digest {:enabled (bpmn/enabled-action-ids runtime2)})
                                      n)
                      (cond-> done? (assoc :status :completed)))]
        {:store (assoc-in store1 [:camunda/instances instance-key] inst1)
         :instance (assoc inst1 :enabled-actions (if done? [] (bpmn/enabled-action-ids runtime2)))}))))

(defn evaluate-decision
  "DMN evaluation. Always NOT_IMPLEMENTED in v1: only allowlisted policy
  checks inside business-process review may decide, never a DMN table."
  [_store _args]
  (fail! :NOT_IMPLEMENTED :mithril.camunda/decision-not-implemented
         "DMN evaluation is not implemented in the v1 profile" {}))
