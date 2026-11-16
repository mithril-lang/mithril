(ns mithril.camunda-test
  (:require [cljs.test :refer [deftest is testing]]
            [mithril.bpmn :as bpmn]
            [mithril.camunda :as camunda]))

(def ontology (apply str (repeat 64 "a")))
(def action-a "https://mithril.fund/id/action/alpha")
(def action-b "https://mithril.fund/id/action/beta")

(def doc
  {"@id" "https://mithril.fund/id/bpmn/camunda-test/process"
   "@type" "bpmn:Process"
   "ontology" ontology
   "nodes" [{"@id" "start" "@type" "bpmn:StartEvent"}
             {"@id" "g0" "@type" "bpmn:ExclusiveGateway"}
             {"@id" "ta" "@type" "bpmn:ServiceTask" "action" action-a}
             {"@id" "tb" "@type" "bpmn:ServiceTask" "action" action-b}
             {"@id" "end" "@type" "bpmn:EndEvent"}]
   "flows" [{"@id" "f0" "@type" "bpmn:SequenceFlow"
              "source" "start" "target" "g0" "condition" "always"}
             {"@id" "f1" "@type" "bpmn:SequenceFlow"
              "source" "g0" "target" "ta" "condition" action-a}
             {"@id" "f2" "@type" "bpmn:SequenceFlow"
              "source" "g0" "target" "tb" "condition" action-b}
             {"@id" "f3" "@type" "bpmn:SequenceFlow"
              "source" "ta" "target" "end" "condition" "always"}
             {"@id" "f4" "@type" "bpmn:SequenceFlow"
              "source" "tb" "target" "end" "condition" "always"}]})

(def action-by-id {action-a {} action-b {}})

(defn deploy-fixture
  ([] (deploy-fixture camunda/empty-store))
  ([store]
   (camunda/deploy store {:definition-key "order"
                           :doc doc
                           :action-by-id action-by-id
                           :policy-action-ids [action-a action-b]
                           :allow-singleton? true})))

(defn error-type [f]
  (try (f) nil
       (catch :default e
         [(:camunda/type (ex-data e)) (:mithril/error (ex-data e))])))

(deftest deploy-versions-and-start
  (let [{:keys [store definition]} (deploy-fixture)
        d2 (:definition (camunda/deploy store {:definition-key "order"
                                               :doc doc
                                               :action-by-id action-by-id
                                               :policy-action-ids [action-a action-b]
                                               :allow-singleton? true}))]
    (is (= 1 (:version definition)))
    (is (= 2 (:version d2)))
    (is (= (:digest definition) (:digest d2)))
    (let [{:keys [store instance]} (camunda/start-instance
                                   (:store (deploy-fixture))
                                   {:definition-key "order"
                                    :business-key "bk-1"
                                    :variables {"amount" 1}
                                    :caller "worker-1"})]
      (is (= :active (:status instance)))
      (is (= #{action-a action-b} (set (:enabled-actions instance))))
      (is (= "order" (:definition-key instance)))
      (is (some? (:key instance))))))

(deftest job-happy-path-and-fail-restore
  (let [{:keys [store]} (deploy-fixture)
        started (camunda/start-instance store {:definition-key "order"
                                               :business-key "bk-j"
                                               :variables {}
                                               :caller "worker-1"})
        s1 (:store started)
        ik (get-in started [:instance :key])
        activated (camunda/activate-jobs s1 {:instance-key ik
                                             :type action-a
                                             :max-jobs 1
                                             :worker-id "w-1"})
        s2 (:store activated)
        job (first (:jobs activated))]
    (is (= action-a (:type job)))
    (let [completed (camunda/complete-job s2 {:instance-key ik
                                              :job-key (:key job)
                                              :worker-id "w-1"
                                              :variables {"ok" true}})]
      (is (= :completed (:status (:job completed))))
      (is (= :completed (get-in completed [:instance :status])))
      (is (= [] (get-in completed [:instance :enabled-actions]))))
    (testing "failed receipt restores the gateway"
      (let [started2 (camunda/start-instance (:store (deploy-fixture))
                                             {:definition-key "order"
                                              :variables {} :caller "w-2"})
            s (:store started2)
            ik2 (get-in started2 [:instance :key])
            act (camunda/activate-jobs s {:instance-key ik2 :type action-a
                                          :max-jobs 1 :worker-id "w-2"})
            failed (camunda/fail-job (:store act)
                                     {:instance-key ik2
                                      :job-key (:key (first (:jobs act)))
                                      :worker-id "w-2"})]
        (is (= :locked (:status (:job failed))))
        (is (= 2 (:retries (:job failed))))
        (is (= #{action-a action-b}
               (set (get-in failed [:instance :enabled-actions]))))
        (is (= :active (get-in failed [:instance :status])))))))

(deftest user-task-and-message-paths
  (let [{:keys [store]} (deploy-fixture)
        started (camunda/start-instance store {:definition-key "order"
                                               :variables {} :caller "op"})
        s1 (:store started)
        ik (get-in started [:instance :key])
        found (camunda/search-user-tasks s1 {:instance-key ik})
        task-key (:key (first (filter #(= action-b (:action %)) (:tasks found))))]
    (is (= 2 (count (:tasks found))))
    (let [claimed (camunda/claim-user-task s1 {:instance-key ik
                                               :task-key task-key
                                               :caller "op-1"})
          done (camunda/complete-user-task (:store claimed)
                                           {:instance-key ik
                                            :task-key task-key
                                            :caller "op-1"
                                            :variables {}})]
      (is (= :completed (:status (:task done))))
      (is (= :completed (get-in done [:instance :status]))))
    (testing "message correlation advances the other branch"
      (let [started2 (camunda/start-instance (:store (deploy-fixture))
                                             {:definition-key "order"
                                              :variables {} :caller "op"})
            s (:store started2)
            ik2 (get-in started2 [:instance :key])
            out (camunda/correlate-message s {:instance-key ik2
                                              :message-name action-a
                                              :caller "op"
                                              :variables {}})]
        (is (= :completed (get-in out [:instance :status])))))))

(deftest terminal-and-negative-cases
  (let [{:keys [store]} (deploy-fixture)
        started (camunda/start-instance store {:definition-key "order"
                                               :variables {} :caller "op"})
        s1 (:store started)
        ik (get-in started [:instance :key])
        cancelled (camunda/cancel-instance s1 {:instance-key ik
                                               :caller "op"
                                               :reason "dup"})]
    (is (= :cancelled (:status (:instance cancelled))))
    (is (= [:CONFLICT :mithril.camunda/instance-not-active]
           (error-type #(camunda/activate-jobs
                         (:store cancelled)
                         {:instance-key ik :max-jobs 1 :worker-id "w"}))))
    (is (= [:NOT_FOUND :mithril.camunda/unknown-definition]
           (error-type #(camunda/start-instance
                         s1 {:definition-key "nope"
                             :variables {} :caller "op"}))))
    (is (= [:NOT_IMPLEMENTED :mithril.camunda/decision-not-implemented]
           (error-type #(camunda/evaluate-decision s1 {})))))
    (is (= [:INVALID_ARGUMENT :mithril.bpmn/action-not-enabled]
           (error-type (fn []
                         (let [{:keys [store]} (deploy-fixture)
                               st (camunda/start-instance
                                   store {:definition-key "order"
                                         :variables {} :caller "op"})
                               s (:store st)
                               ik (get-in st [:instance :key])]
                           (camunda/activate-jobs s {:instance-key ik
                                                     :type "https://mithril.fund/id/action/other"
                                                     :max-jobs 1
                                                     :worker-id "w"})))))))

(deftest failed-job-preserves-worker-and-status-boundaries
  (let [started (camunda/start-instance (:store (deploy-fixture))
                                       {:definition-key "order" :caller "owner"})
        ik (get-in started [:instance :key])
        activated (camunda/activate-jobs (:store started)
                                         {:instance-key ik :type action-a
                                          :worker-id "owner" :max-jobs 1})
        state (:store activated)
        jk (:key (first (:jobs activated)))]
    (is (= [:CONFLICT :mithril.camunda/job-locked]
           (error-type #(camunda/fail-job state {:instance-key ik :job-key jk
                                                 :worker-id "other" :retries-left 0}))))
    (is (= :active (get-in state [:camunda/instances ik :status])))
    (is (= 3 (get-in state [:camunda/instances ik :jobs jk :retries])))
    (doseq [status [:completed :exhausted]]
      (let [not-locked (assoc-in state [:camunda/instances ik :jobs jk :status] status)]
        (is (= [:CONFLICT :mithril.camunda/job-not-locked]
               (error-type #(camunda/fail-job not-locked
                                             {:instance-key ik :job-key jk
                                              :worker-id "owner" :retries-left 3}))))
        (is (= status (get-in not-locked [:camunda/instances ik :jobs jk :status])))))))

(deftest claimed-user-task-cannot-be-reassigned-by-another-principal
  (let [started (camunda/start-instance (:store (deploy-fixture))
                                       {:definition-key "order" :caller "starter"})
        ik (get-in started [:instance :key])
        search (camunda/search-user-tasks (:store started) {:instance-key ik})
        tk (:key (first (:tasks search)))
        claimed (camunda/claim-user-task (:store started)
                                        {:instance-key ik :task-key tk :caller "owner"})
        state (:store claimed)]
    (is (= [:CONFLICT :mithril.camunda/task-assigned]
           (error-type #(camunda/claim-user-task state
                                                {:instance-key ik :task-key tk :caller "other"}))))
    (is (= "owner" (get-in state [:camunda/instances ik :tasks tk :assignee])))
    (is (= [:CONFLICT :mithril.camunda/task-assigned]
           (error-type #(camunda/complete-user-task state
                                                   {:instance-key ik :task-key tk :caller "other"}))))
    (is (= :completed (get-in (camunda/complete-user-task state
                                                       {:instance-key ik :task-key tk :caller "owner"})
                              [:task :status])))))
