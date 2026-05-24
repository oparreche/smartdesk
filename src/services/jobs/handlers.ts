/**
 * Importa todos os módulos que registram handlers via `registerJobHandler`.
 * Cada serviço chama `registerJobHandler` no top-level — ao importar este arquivo,
 * todos ficam disponíveis no registry.
 */
import '@/src/services/gmail/handlers-register';
import '@/src/services/integrations/handlers-register';
import '@/src/services/whatsapp/handlers-register';
import '@/src/services/webhooks/handlers-register';
